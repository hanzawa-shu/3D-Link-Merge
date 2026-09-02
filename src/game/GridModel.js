// 1マス=1オブジェクトではなく、1つの「エンティティ」が複数マス・複数段（3Dミノ）を
// 占有できるモデル。columns[x][z][y] には { entityId, color } もしくは空きを表す null が入る。
// エンティティの実体（色・占有セル一覧）は entities に別管理する。
// エンティティ内のセルは、(x,z)列ごとに独立して地形に着地するため、同一エンティティ内でも
// yが揃うとは限らない（モデルP。仕様書「4. 合体ルール」・設計書「4.1」参照）。
export class GridModel {
  constructor(size, maxHeight) {
    this.size = size;
    this.maxHeight = maxHeight;
    this.columns = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => new Array(maxHeight).fill(null))
    );
    this.entities = new Map();
    this.nextEntityId = 1;
  }

  inBounds(x, z) {
    return x >= 0 && x < this.size && z >= 0 && z < this.size;
  }

  // 最初にnullが現れる高さ = そのマスの積み上げ高さ。settle()後はギャップが無い前提。
  getHeight(x, z) {
    const column = this.columns[x][z];
    for (let y = 0; y < this.maxHeight; y++) {
      if (column[y] === null) return y;
    }
    return this.maxHeight;
  }

  canPlace(x, z) {
    return this.getHeight(x, z) < this.maxHeight;
  }

  getEntityAt(x, z, y) {
    if (!this.inBounds(x, z) || y < 0 || y >= this.maxHeight) return null;
    const slot = this.columns[x][z][y];
    return slot ? this.entities.get(slot.entityId) ?? null : null;
  }

  getColorAt(x, z, y) {
    if (!this.inBounds(x, z) || y < 0 || y >= this.maxHeight) return null;
    const slot = this.columns[x][z][y];
    return slot ? slot.color : null;
  }

  /**
   * orientedCells（[[dx,dy,dz], ...]。回転適用・正規化済みのローカルオフセット）を
   * アンカー(anchorX, anchorZ)に置いた場合の、実際に着地する絶対セル一覧を計算する（モデルP）。
   * (dx,dz)が同じセルは同一列内の縦積みとして扱い、地形追従の対象外（内部の相対位置は固定）。
   * 異なる列同士は、それぞれ独立して現在の積み上げ高さの上に着地する。
   * 配置不可（盤外・高さ上限超過・隣接列の高低差が上限超過）の場合はnullを返す。
   */
  computeLanding(orientedCells, anchorX, anchorZ, maxAdjacentHeightDiff) {
    if (orientedCells.length === 0) return null;

    const groups = new Map();
    for (const [dx, dy, dz] of orientedCells) {
      const key = `${dx},${dz}`;
      if (!groups.has(key)) groups.set(key, { dx, dz, dys: [] });
      groups.get(key).dys.push(dy);
    }

    for (const g of groups.values()) {
      g.worldX = anchorX + g.dx;
      g.worldZ = anchorZ + g.dz;
      if (!this.inBounds(g.worldX, g.worldZ)) return null;
      g.minDy = Math.min(...g.dys);
      g.baseHeight = this.getHeight(g.worldX, g.worldZ);
      // 列グループが占有する絶対y範囲（縦積みの場合、底から一番上までの区間）。
      g.loAbs = g.baseHeight;
      g.hiAbs = g.baseHeight + (Math.max(...g.dys) - g.minDy);
    }

    const groupList = [...groups.values()];
    for (let i = 0; i < groupList.length; i++) {
      for (let j = i + 1; j < groupList.length; j++) {
        const a = groupList[i];
        const b = groupList[j];
        const footprintAdjacent = Math.abs(a.dx - b.dx) + Math.abs(a.dz - b.dz) === 1;
        if (!footprintAdjacent) continue;
        // 列グループの底同士ではなく、隣接列との距離が一番近いセル同士（区間の隙間）で高低差を測る。
        // 縦積みで一部が既に相手側の高さまで届いている場合、それを正しく「近い」と扱うため。
        const gap = Math.max(0, Math.max(a.loAbs, b.loAbs) - Math.min(a.hiAbs, b.hiAbs));
        if (gap > maxAdjacentHeightDiff) return null;
      }
    }

    const worldCells = [];
    for (const [dx, dy, dz] of orientedCells) {
      const g = groups.get(`${dx},${dz}`);
      const y = g.baseHeight + (dy - g.minDy);
      if (y >= this.maxHeight) return null;
      worldCells.push({ x: g.worldX, z: g.worldZ, y });
    }
    return worldCells;
  }

  /**
   * computeLanding()と同じ列グルーピングで、配置条件（盤外・高低差上限・高さ上限）を検証せず
   * 常に何らかの絶対セル一覧を返す。配置不可な位置でもプレビュー表示するためだけに使う。
   */
  previewLanding(orientedCells, anchorX, anchorZ) {
    const groups = new Map();
    for (const [dx, dy, dz] of orientedCells) {
      const key = `${dx},${dz}`;
      if (!groups.has(key)) groups.set(key, { dx, dz, dys: [] });
      groups.get(key).dys.push(dy);
    }
    for (const g of groups.values()) {
      g.worldX = anchorX + g.dx;
      g.worldZ = anchorZ + g.dz;
      g.minDy = Math.min(...g.dys);
      g.baseHeight = this.inBounds(g.worldX, g.worldZ) ? this.getHeight(g.worldX, g.worldZ) : 0;
    }
    return orientedCells.map(([dx, dy, dz]) => {
      const g = groups.get(`${dx},${dz}`);
      return { x: g.worldX, z: g.worldZ, y: g.baseHeight + (dy - g.minDy) };
    });
  }

  /**
   * computeLanding()で得たworldCellsからエンティティを生成する。生成したentityIdを返す。
   * bondPairsは着地前のローカル形状から計算した、紐（ボンド）で繋ぐべきセルのインデックスペア
   * （Config.computeLocalBondIndexPairs参照）。cellsと同じ並び順に対応する固定情報として保持する。
   */
  placeCells(worldCells, color, bondPairs = []) {
    const id = this.nextEntityId++;
    const cells = worldCells.map(({ x, z, y }) => ({ x, z, y }));
    for (const c of cells) this.columns[c.x][c.z][c.y] = { entityId: id, color };
    this.entities.set(id, { id, color, cells, bondPairs });
    return id;
  }

  removeEntities(entityIds) {
    for (const id of entityIds) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      for (const c of entity.cells) this.columns[c.x][c.z][c.y] = null;
      this.entities.delete(id);
    }
  }

  /**
   * 除去後にできた隙間を埋めるよう、まだ残っているエンティティを重力で沈める。
   * 列（x,z）ごとに独立して沈める: 同じ列内で縦積みになっているセル同士は一体で落とすが、
   * 同一エンティティでも異なる列同士は互いに独立して、その列で空いている分だけ落とす。
   * これにより「全セルが必ず何かの上に着地する」状態を保つ（列内にギャップ＝浮きセルを作らない）。
   * getHeight()や配置・ゲームオーバー判定は「列にギャップが無い」ことを前提にしているため、
   * この不変条件を維持することが重要（剛体一括落下だと片持ちの浮きセルが残り不変条件を壊す）。
   * 落下量計測の間は当該列グループの自セルを一時的に盤面から外し、自セルを支えと誤認しないようにする。
   * 戻り値は実際に沈んだエンティティごとの情報。列によって沈んだ量が異なる場合は
   * `uniform: false`となり、呼び出し側は各セルを個別に動かす必要がある。
   */
  settle() {
    const beforeSnapshots = new Map();
    for (const entity of this.entities.values()) {
      beforeSnapshots.set(entity.id, entity.cells.map((c) => ({ ...c })));
    }

    let anyMoved = true;
    while (anyMoved) {
      anyMoved = false;
      for (const entity of this.entities.values()) {
        const columnGroups = new Map();
        for (const c of entity.cells) {
          const key = `${c.x},${c.z}`;
          if (!columnGroups.has(key)) columnGroups.set(key, []);
          columnGroups.get(key).push(c);
        }

        for (const groupCells of columnGroups.values()) {
          // 自分自身（同じ列の縦積み）を「支え」と誤認識しないよう、一時的に取り除く。
          for (const c of groupCells) this.columns[c.x][c.z][c.y] = null;

          const gx = groupCells[0].x;
          const gz = groupCells[0].z;
          const bottomY = Math.min(...groupCells.map((c) => c.y));
          let fall = 0;
          let y = bottomY - 1;
          while (y >= 0 && this.columns[gx][gz][y] === null) {
            fall++;
            y--;
          }

          if (fall > 0) {
            for (const c of groupCells) c.y -= fall;
            anyMoved = true;
          }
          for (const c of groupCells) this.columns[c.x][c.z][c.y] = { entityId: entity.id, color: entity.color };
        }
      }
    }

    const moved = [];
    for (const entity of this.entities.values()) {
      const before = beforeSnapshots.get(entity.id);
      const after = entity.cells;
      const deltas = before.map((b, i) => b.y - after[i].y);
      if (deltas.every((d) => d === 0)) continue;
      const uniform = deltas.every((d) => d === deltas[0]);
      moved.push({
        id: entity.id,
        uniform,
        delta: uniform ? deltas[0] : null,
        before,
        after: after.map((c) => ({ ...c })),
        // このエンティティが、settle()後の連鎖でさらに合体して消えることがある。
        // その場合entities.get(id)はもう存在しないため、アニメーション側で参照できるよう
        // この時点のbondPairsをスナップショットとして持たせておく。
        bondPairs: entity.bondPairs ?? [],
      });
    }
    return moved;
  }

  isGameOver() {
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        if (!this.canPlace(x, z)) return true;
      }
    }
    return false;
  }
}
