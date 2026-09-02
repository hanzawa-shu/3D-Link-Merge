import * as THREE from "three";
import { GridModel } from "./GridModel.js";
import { resolveMerges } from "./MergeResolver.js";
import { computeMergeScore } from "./ScoreManager.js";
import { SpawnManager } from "./SpawnManager.js";
import { orientShape, shapeCellCount, computeLocalBondIndexPairs } from "./Config.js";
import { createObjectMesh, createBondMesh, positionBondBetween } from "../scene/ObjectFactory.js";
import { animateDrop, animateDropAsync, animateScaleAsync } from "../scene/Tween.js";
import { CursorController } from "../input/CursorController.js";

const HIGHLIGHT_DIM_OPACITY = 0.12;
const MAX_SHAPE_CELLS = 8;
const GHOST_INVALID_COLOR = 0xff3b3b;

export class GameController {
  constructor({ sceneManager, config, hud, onGameOver }) {
    this.sceneManager = sceneManager;
    this.config = config;
    this.hud = hud;
    this.onGameOver = onGameOver;

    this.grid = new GridModel(config.boardSize, config.maxHeight);
    this.spawnManager = new SpawnManager(config);
    this.pendingPitch = 0;
    this.pendingYaw = 0;

    this.entityMeshes = new Map();
    this.highlightedColors = new Set();
    this.score = 0;
    this.busy = false;
    this.gameOver = false;
    this.paused = false;
    this.cursorDangerous = false;
    this.cursorValid = true;

    this.highlightCells = this._createHighlightCells();
    for (const mesh of this.highlightCells) this.sceneManager.objectGroup.add(mesh);

    this.ghostGroup = new THREE.Group();
    this.sceneManager.objectGroup.add(this.ghostGroup);

    this.cursor = new CursorController(config, {
      onMove: (x, z) => this._updateCursorVisual(x, z),
      onConfirm: (x, z) => this._handleConfirm(x, z),
    });

    this._keyHandler = (e) => this._handleKey(e);
    window.addEventListener("keydown", this._keyHandler);

    this._updateCursorVisual(this.cursor.x, this.cursor.z);
    this.hud.setNextColor(this.spawnManager.current);
    this.hud.setScore(this.score);
  }

  _createHighlightCells() {
    const meshes = [];
    for (let i = 0; i < MAX_SHAPE_CELLS; i++) {
      const geo = new THREE.BoxGeometry(0.92, 0.06, 0.92);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
      meshes.push(new THREE.Mesh(geo, mat));
    }
    return meshes;
  }

  currentOrientedCells() {
    const baseCells = this.config.baseShapes[this.spawnManager.current];
    return orientShape(baseCells, this.pendingPitch, this.pendingYaw);
  }

  _handleKey(e) {
    switch (e.key) {
      case "ArrowUp":
        this.moveCursor("up");
        break;
      case "ArrowDown":
        this.moveCursor("down");
        break;
      case "ArrowLeft":
        this.moveCursor("left");
        break;
      case "ArrowRight":
        this.moveCursor("right");
        break;
      case "r":
      case "R":
        this.rotateYaw();
        break;
      case "t":
      case "T":
        this.rotatePitch();
        break;
      case " ":
      case "Enter":
        this.confirmDrop();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  /**
   * 現在のカメラの向きを基準に、画面上の上下左右をワールド座標のグリッド軸へスナップする。
   * カメラを回転させても「画面奥=Up、画面手前=Down、画面右=Right」が常に保たれるようにする。
   */
  _resolveScreenDirection(screenDir) {
    const camera = this.sceneManager.camera;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const snap = (v) => {
      if (Math.abs(v.x) >= Math.abs(v.z)) return { dx: Math.sign(v.x) || 1, dz: 0 };
      return { dx: 0, dz: Math.sign(v.z) || 1 };
    };

    const f = snap(forward);
    const r = snap(right);

    switch (screenDir) {
      case "up":
        return f;
      case "down":
        return { dx: -f.dx, dz: -f.dz };
      case "right":
        return r;
      case "left":
        return { dx: -r.dx, dz: -r.dz };
      default:
        return { dx: 0, dz: 0 };
    }
  }

  worldPos(x, z, y) {
    const s = this.config.cellSize;
    return { x: x * s, y: (y + 0.5) * s, z: z * s };
  }

  layerY(y) {
    return (y + 0.5) * this.config.cellSize;
  }

  _updateCursorVisual(x, z) {
    if (this.gameOver) return;
    const orientedCells = this.currentOrientedCells();
    const landing = this.grid.computeLanding(orientedCells, x, z, this.config.maxAdjacentHeightDiff);
    const valid = landing !== null;
    this.cursorValid = valid;
    const previewCells = valid ? landing : this.grid.previewLanding(orientedCells, x, z);

    for (let i = 0; i < this.highlightCells.length; i++) {
      const mesh = this.highlightCells[i];
      if (i >= previewCells.length) {
        mesh.visible = false;
        continue;
      }
      const cell = previewCells[i];
      const pos = this.worldPos(cell.x, cell.z, cell.y);
      mesh.position.set(pos.x, Math.max(0.03, cell.y * this.config.cellSize), pos.z);
      mesh.visible = true;
    }

    const maxLandedY = Math.max(...previewCells.map((c) => c.y));
    this.cursorDangerous = valid && maxLandedY === this.config.maxHeight - 1;
    if (!this.cursorDangerous) {
      for (const mesh of this.highlightCells) {
        mesh.scale.set(1, 1, 1);
        mesh.material.opacity = valid ? 0.35 : 0.18;
        mesh.material.color.setHex(valid ? 0xffffff : 0xff0000);
      }
    }

    this._updateGhost(previewCells, valid, orientedCells);
  }

  _clearGhostChildren() {
    while (this.ghostGroup.children.length) {
      const child = this.ghostGroup.children.pop();
      child.geometry.dispose();
      child.material.dispose();
    }
  }

  _updateGhost(previewCells, valid, orientedCells) {
    this._clearGhostChildren();
    const color = this.spawnManager.current;

    for (const cell of previewCells) {
      const mesh = createObjectMesh(color);
      mesh.material.opacity = 0.45;
      if (!valid) mesh.material.color.setHex(GHOST_INVALID_COLOR);
      const pos = this.worldPos(cell.x, cell.z, cell.y);
      mesh.position.set(pos.x, pos.y, pos.z);
      this.ghostGroup.add(mesh);
    }

    for (const [i, j] of computeLocalBondIndexPairs(orientedCells)) {
      const a = previewCells[i];
      const b = previewCells[j];
      const bond = createBondMesh(color);
      bond.material.opacity = 0.45;
      if (!valid) bond.material.color.setHex(GHOST_INVALID_COLOR);
      positionBondBetween(bond, this.worldPos(a.x, a.z, a.y), this.worldPos(b.x, b.z, b.y));
      this.ghostGroup.add(bond);
    }

    this.ghostGroup.visible = true;
  }

  _hideGhost() {
    this._clearGhostChildren();
    this.ghostGroup.visible = false;
  }

  /** 毎フレーム呼ばれる。危険な高さに置こうとしている場合、カーソルを点滅＋サイズ変化させる。 */
  update(now) {
    if (!this.cursorDangerous) return;
    const pulse = Math.sin(now * 0.008);
    const scale = 1 + pulse * 0.25;
    const opacity = 0.35 + (pulse * 0.5 + 0.5) * 0.45;
    for (const mesh of this.highlightCells) {
      if (!mesh.visible) continue;
      mesh.scale.set(scale, 1, scale);
      mesh.material.opacity = opacity;
      mesh.material.color.setHex(0xff3b3b);
    }
  }

  moveCursor(screenDir) {
    const { dx, dz } = this._resolveScreenDirection(screenDir);
    this.cursor.move(dx, dz);
  }

  confirmDrop() {
    this.cursor.confirm();
  }

  rotatePitch() {
    if (this.busy || this.gameOver || this.paused) return;
    if (shapeCellCount(this.spawnManager.current) <= 1) return;
    this.pendingPitch = (this.pendingPitch + 1) % 4;
    this._updateCursorVisual(this.cursor.x, this.cursor.z);
  }

  rotateYaw() {
    if (this.busy || this.gameOver || this.paused) return;
    if (shapeCellCount(this.spawnManager.current) <= 1) return;
    this.pendingYaw = (this.pendingYaw + 1) % 4;
    this._updateCursorVisual(this.cursor.x, this.cursor.z);
  }

  pause() {
    if (this.gameOver) return;
    this.paused = true;
    this.cursor.enabled = false;
  }

  resume() {
    if (this.gameOver) return;
    this.paused = false;
    if (!this.busy) this.cursor.enabled = true;
  }

  setHighlightedColors(colors) {
    this.highlightedColors = new Set(colors);
    for (const group of this.entityMeshes.values()) this._applyHighlightOpacity(group);
  }

  _applyHighlightOpacity(group) {
    const active = this.highlightedColors.size === 0 || this.highlightedColors.has(group.userData.color);
    for (const child of group.children) child.material.opacity = active ? 1 : HIGHLIGHT_DIM_OPACITY;
  }

  _createEntityGroup(entity) {
    const group = new THREE.Group();
    group.userData.color = entity.color;
    const minY = Math.min(...entity.cells.map((c) => c.y));
    group.position.y = this.layerY(minY);

    for (const cell of entity.cells) {
      const mesh = createObjectMesh(entity.color);
      mesh.position.set(
        cell.x * this.config.cellSize,
        (cell.y - minY) * this.config.cellSize,
        cell.z * this.config.cellSize
      );
      group.add(mesh);
    }

    for (const [i, j] of entity.bondPairs ?? []) {
      const a = entity.cells[i];
      const b = entity.cells[j];
      const bond = createBondMesh(entity.color);
      const localA = { x: a.x * this.config.cellSize, y: (a.y - minY) * this.config.cellSize, z: a.z * this.config.cellSize };
      const localB = { x: b.x * this.config.cellSize, y: (b.y - minY) * this.config.cellSize, z: b.z * this.config.cellSize };
      positionBondBetween(bond, localA, localB);
      group.add(bond);
    }

    return group;
  }

  async _handleConfirm(x, z) {
    if (this.busy || this.gameOver || this.paused) return;
    const orientedCells = this.currentOrientedCells();
    const landing = this.grid.computeLanding(orientedCells, x, z, this.config.maxAdjacentHeightDiff);
    if (!landing) return;

    this.busy = true;
    this.cursor.enabled = false;
    this._hideGhost();

    // 配置・合体演出中に想定外の例外が出ても、busy/cursorを必ず復旧して操作不能にならないようにする
    // （1回の失敗でゲーム全体がロックし、再起動でしか直らない事態を防ぐ）。
    try {
      const color = this.spawnManager.current;
      const bondIndexPairs = computeLocalBondIndexPairs(orientedCells);
      const entityId = this.grid.placeCells(landing, color, bondIndexPairs);
      const entity = this.grid.entities.get(entityId);
      const group = this._createEntityGroup(entity);
      const targetY = group.position.y;
      const startY = this.config.maxHeight * this.config.cellSize + 3;
      group.position.y = startY;
      this.sceneManager.objectGroup.add(group);
      this.entityMeshes.set(entityId, group);
      this._applyHighlightOpacity(group);

      await animateDropAsync(group, startY, targetY);

      const events = resolveMerges(this.grid, entityId, this.config);
      if (events.length) {
        const gained = computeMergeScore(events, this.config);
        await this._playMergeEvents(events);
        this.score += gained;
        this.hud.setScore(this.score);
      }

      this.spawnManager.advance();
      this.pendingPitch = 0;
      this.pendingYaw = 0;
      this.hud.setNextColor(this.spawnManager.current);

      if (this.grid.isGameOver()) {
        this._endGame();
        return;
      }
    } catch (err) {
      console.error("[GameController._handleConfirm] 配置処理で例外が発生しました:", err);
    } finally {
      if (!this.gameOver) {
        this.busy = false;
        this.cursor.enabled = !this.paused;
        this._updateCursorVisual(this.cursor.x, this.cursor.z);
      }
    }
  }

  async _playMergeEvents(events) {
    for (const ev of events) {
      await Promise.all(ev.clearedEntityIds.map((id) => this._removeEntityGroup(id)));
      await Promise.all(ev.settledEntities.map((s) => this._animateSettle(s)));
      if (ev.resultEntityId != null) {
        await this._spawnMergedEntity(ev.resultEntityId, ev.resultColor, ev.resultCells, ev.resultBondPairs);
      }
    }
  }

  async _removeEntityGroup(entityId) {
    const group = this.entityMeshes.get(entityId);
    this.entityMeshes.delete(entityId);
    if (!group) return;
    await animateScaleAsync(group, 1, 0.001, 220);
    this.sceneManager.objectGroup.remove(group);
    for (const child of group.children) {
      child.geometry.dispose();
      child.material.dispose();
    }
  }

  async _animateSettle(settled) {
    const group = this.entityMeshes.get(settled.id);
    if (!group) return;

    if (settled.uniform) {
      const targetY = group.position.y - settled.delta * this.config.cellSize;
      await animateDropAsync(group, group.position.y, targetY, 260);
      return;
    }

    // 列ごとに沈んだ量が異なる場合、Groupを作り直さず（＝消えて再生成されたように
    // 見えてしまうため）、各セルのローカルYとGroup自体のposition.yを同時に補間して、
    // パーツごとに滑らかに動く見た目にする。ボンドの組み合わせはsettle()時点でスナップショット
    // 済みの settled.bondPairs を使う（このエンティティは連鎖の後続ステップで合体して
    // grid.entitiesから既に削除されている場合があり、そこから引き直すと取得できないため）。
    const cellCount = settled.after.length;
    const cellMeshes = group.children.slice(0, cellCount);
    const bondMeshes = group.children.slice(cellCount);
    const bondIndexPairs = settled.bondPairs ?? [];

    const oldMinY = Math.min(...settled.before.map((c) => c.y));
    const newMinY = Math.min(...settled.after.map((c) => c.y));
    const startGroupY = group.position.y;
    const endGroupY = this.layerY(newMinY);
    const startLocalY = settled.before.map((c) => (c.y - oldMinY) * this.config.cellSize);
    const endLocalY = settled.after.map((c) => (c.y - newMinY) * this.config.cellSize);

    await new Promise((resolve) => {
      animateDrop({
        from: 0,
        to: 1,
        duration: 260,
        onUpdate: (t) => {
          group.position.y = startGroupY + (endGroupY - startGroupY) * t;
          for (let i = 0; i < cellMeshes.length; i++) {
            cellMeshes[i].position.y = startLocalY[i] + (endLocalY[i] - startLocalY[i]) * t;
          }
          for (let k = 0; k < bondMeshes.length; k++) {
            const [i, j] = bondIndexPairs[k];
            positionBondBetween(bondMeshes[k], cellMeshes[i].position, cellMeshes[j].position);
          }
        },
        onComplete: resolve,
      });
    });
  }

  async _spawnMergedEntity(entityId, color, cells, bondPairs) {
    // grid.entitiesを今読み直すと、同じ連鎖の後続ステップで既にさらに沈んだ後の座標に
    // なっている場合がある（resolveMerges()は全ステップを先に同期的に処理するため）。
    // そのため生成時点でスナップショットされたcells/bondPairsをそのまま使う
    // （MergeResolver.resolveMergesのresultCells/resultBondPairs参照）。
    const group = this._createEntityGroup({ color, cells, bondPairs });
    group.scale.setScalar(0.001);
    this.sceneManager.objectGroup.add(group);
    this.entityMeshes.set(entityId, group);
    this._applyHighlightOpacity(group);
    await animateScaleAsync(group, 0.001, 1, 260);
  }

  _endGame() {
    this.gameOver = true;
    this.busy = true;
    this.cursor.enabled = false;
    for (const mesh of this.highlightCells) mesh.visible = false;
    this._hideGhost();
    if (this.onGameOver) this.onGameOver(this.score);
  }

  dispose() {
    window.removeEventListener("keydown", this._keyHandler);
    this._clearGhostChildren();
  }
}
