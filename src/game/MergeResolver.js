import { orientShape, computeLocalBondIndexPairs } from "./Config.js";

const NEIGHBOR_OFFSETS = [
  { dx: 1, dz: 0, dy: 0 },
  { dx: -1, dz: 0, dy: 0 },
  { dx: 0, dz: 1, dy: 0 },
  { dx: 0, dz: -1, dy: 0 },
  { dx: 0, dz: 0, dy: 1 },
  { dx: 0, dz: 0, dy: -1 },
];

/** 同色の隣接エンティティをBFSで探索し、連結グループ（エンティティの配列）を返す。 */
function floodFillEntities(grid, seedEntityId) {
  const seed = grid.entities.get(seedEntityId);
  if (!seed) return [];
  const color = seed.color;
  const visited = new Set([seedEntityId]);
  const queue = [seedEntityId];

  while (queue.length) {
    const id = queue.pop();
    const entity = grid.entities.get(id);
    for (const cell of entity.cells) {
      for (const offset of NEIGHBOR_OFFSETS) {
        const neighbor = grid.getEntityAt(cell.x + offset.dx, cell.z + offset.dz, cell.y + offset.dy);
        if (!neighbor || neighbor.color !== color || visited.has(neighbor.id)) continue;
        visited.add(neighbor.id);
        queue.push(neighbor.id);
      }
    }
  }
  return [...visited].map((id) => grid.entities.get(id));
}

/**
 * 除去予定のエンティティを除いた場合の、各(x,z)列の高さを事前に計算する（実際にはまだ除去しない）。
 * 既知の簡略化: 複数マスにまたがる別エンティティが、除去対象の真上に一部だけ乗っている
 * （＝他の支持列は無傷で浮いたままになる）ような稀なケースでは、実際のsettle()後の高さと
 * ずれる可能性がある。発生頻度・影響とも小さいため、この版では厳密なシミュレーションは行わない。
 */
function simulateHeightsAfterRemoval(grid, entityIds) {
  const idSet = new Set(entityIds);
  const touched = new Set();
  for (const id of entityIds) {
    const entity = grid.entities.get(id);
    for (const c of entity.cells) touched.add(`${c.x},${c.z}`);
  }
  const heights = new Map();
  for (const key of touched) {
    const [x, z] = key.split(",").map(Number);
    let count = 0;
    for (let y = 0; y < grid.maxHeight; y++) {
      const slot = grid.columns[x][z][y];
      if (slot && idSet.has(slot.entityId)) continue;
      if (slot === null) break;
      count++;
    }
    heights.set(key, count);
  }
  return heights;
}

function heightAt(grid, simulatedHeights, x, z) {
  const key = `${x},${z}`;
  return simulatedHeights.has(key) ? simulatedHeights.get(key) : grid.getHeight(x, z);
}

/**
 * GridModel.computeLanding と同じロジック（モデルP: 列ごとに独立着地・隣接列の高低差上限）だが、
 * 高さの参照先を simulatedHeights（除去後シミュレーション）優先にしたもの。
 */
function computeLandingWithSimulatedHeights(grid, orientedCells, anchorX, anchorZ, simulatedHeights, config, ignoreHeightDiffCap = false) {
  const groups = new Map();
  for (const [dx, dy, dz] of orientedCells) {
    const key = `${dx},${dz}`;
    if (!groups.has(key)) groups.set(key, { dx, dz, dys: [] });
    groups.get(key).dys.push(dy);
  }

  for (const g of groups.values()) {
    g.worldX = anchorX + g.dx;
    g.worldZ = anchorZ + g.dz;
    if (!grid.inBounds(g.worldX, g.worldZ)) return null;
    g.minDy = Math.min(...g.dys);
    g.baseHeight = heightAt(grid, simulatedHeights, g.worldX, g.worldZ);
    g.loAbs = g.baseHeight;
    g.hiAbs = g.baseHeight + (Math.max(...g.dys) - g.minDy);
  }

  if (!ignoreHeightDiffCap) {
    const groupList = [...groups.values()];
    for (let i = 0; i < groupList.length; i++) {
      for (let j = i + 1; j < groupList.length; j++) {
        const a = groupList[i];
        const b = groupList[j];
        const footprintAdjacent = Math.abs(a.dx - b.dx) + Math.abs(a.dz - b.dz) === 1;
        if (!footprintAdjacent) continue;
        // GridModel.computeLanding と同じロジック: 列グループの底ではなく、隣接列に一番近い
        // セル同士（区間の隙間）で高低差を測る。
        const gap = Math.max(0, Math.max(a.loAbs, b.loAbs) - Math.min(a.hiAbs, b.hiAbs));
        if (gap > config.maxAdjacentHeightDiff) return null;
      }
    }
  }

  const worldCells = [];
  for (const [dx, dy, dz] of orientedCells) {
    const g = groups.get(`${dx},${dz}`);
    const y = g.baseHeight + (dy - g.minDy);
    if (y >= config.maxHeight) return null;
    worldCells.push({ x: g.worldX, z: g.worldZ, y });
  }
  return worldCells;
}

/**
 * 消えたグループの跡地（とその隣接1マス）だけを探索範囲にして、次の色の形状が
 * （縦回転・横回転の組み合わせ、最大16通り試して）配置条件を満たす位置・向きを探す。
 * 探索範囲内の有効な候補すべてを評価し、その中で「配置後にそのオブジェクトが占有する
 * 最も高いセル(y)」が最小になる候補を採用する（＝高さ制限に近い危険な配置は最後の手段とし、
 * 同じ範囲内に低く安全な配置があればそちらを優先する）。
 * 高低差の上限を守った候補が範囲内に1つも無い場合は、上限を無視した候補（ただし盤外・
 * 高さ上限超過は依然として無効）でフォールバック探索する。それでも見つからなければ
 * 合体自体を保留する（nullを返す）。
 * 見つかった場合は`{ worldCells, bondPairs }`を返す（bondPairsはヒットした向きのローカル
 * 形状から計算した紐接続ペア）。
 */
function findPlacementNearVacated(grid, group, nextColor, config) {
  const entityIds = group.map((e) => e.id);
  const simulatedHeights = simulateHeightsAfterRemoval(grid, entityIds);

  const candidateKeys = new Set();
  const addCandidate = (x, z) => {
    if (grid.inBounds(x, z)) candidateKeys.add(`${x},${z}`);
  };
  for (const entity of group) {
    for (const c of entity.cells) {
      addCandidate(c.x, c.z);
      addCandidate(c.x + 1, c.z);
      addCandidate(c.x - 1, c.z);
      addCandidate(c.x, c.z + 1);
      addCandidate(c.x, c.z - 1);
    }
  }

  const baseCells = config.baseShapes[nextColor];

  const search = (ignoreHeightDiffCap) => {
    let best = null;
    let bestMaxY = Infinity;
    for (const key of candidateKeys) {
      const [ax, az] = key.split(",").map(Number);
      for (let pitch = 0; pitch < 4; pitch++) {
        for (let yaw = 0; yaw < 4; yaw++) {
          const orientedCells = orientShape(baseCells, pitch, yaw);
          const worldCells = computeLandingWithSimulatedHeights(
            grid,
            orientedCells,
            ax,
            az,
            simulatedHeights,
            config,
            ignoreHeightDiffCap
          );
          if (!worldCells) continue;
          const maxY = Math.max(...worldCells.map((c) => c.y));
          if (maxY < bestMaxY) {
            bestMaxY = maxY;
            best = { worldCells, bondPairs: computeLocalBondIndexPairs(orientedCells) };
          }
        }
      }
    }
    return best;
  };

  // 通常探索: 高低差の上限を守った候補を優先する。
  const strict = search(false);
  if (strict) return strict;
  // フォールバック: 範囲内に高低差の上限を守れる候補が1つも無い場合のみ、上限を無視して
  // 探索し直す（盤外・高さ上限超過は依然として無効のまま）。これにより、周囲が地形で
  // 塞がれていて置き場所が見つからない、という理由だけで合体が止まってしまう事態を避ける。
  return search(true);
}

/** グループ（エンティティ配列）を、含まれるentityIdの昇順で一意に識別する文字列キーにする。 */
function groupKey(group) {
  return group
    .map((e) => e.id)
    .sort((a, b) => a - b)
    .join(",");
}

/**
 * 盤面全体を走査し、まだ処理・保留していない「合体条件（同色4個以上）を満たす連結グループ」を
 * 1つ返す。preferredSeedId が指定され、その周辺にグループがあればそれを優先する
 * （＝直前に置いた／生成したオブジェクトの合体が先に演出されるようにする）。
 * heldKeys に含まれるグループ（置き場所が見つからず保留したもの）はスキップする。無ければnull。
 */
function findMergeableGroup(grid, config, preferredSeedId, heldKeys) {
  if (preferredSeedId != null && grid.entities.get(preferredSeedId)) {
    const group = floodFillEntities(grid, preferredSeedId);
    if (group.length >= config.mergeThreshold && !heldKeys.has(groupKey(group))) {
      return group;
    }
  }

  const visited = new Set();
  for (const entity of grid.entities.values()) {
    if (visited.has(entity.id)) continue;
    const group = floodFillEntities(grid, entity.id);
    for (const e of group) visited.add(e.id);
    if (group.length < config.mergeThreshold) continue;
    if (heldKeys.has(groupKey(group))) continue;
    return group;
  }
  return null;
}

/**
 * 着地したエンティティを起点に合体・連鎖を解決する。
 * 毎ラウンド盤面全体を再スキャンするため、合体後の落下（settle）で新たに繋がった別の
 * 同色グループも取りこぼさず連鎖させる（例: 白-黄-白の層構造で中間の黄が消えて白同士が繋がる）。
 * 戻り値は連鎖ごとのイベント配列（スコア計算・演出の両方で利用する）。
 */
export function resolveMerges(grid, seedEntityId, config) {
  const events = [];
  let chainIndex = 0;
  // 置き場所が見つからず保留したグループのキー。無限ループを防ぐため、次に何か合体が成立して
  // 盤面が変化するまでは再検出しない（合体が起きたらクリアして再評価する）。
  const heldKeys = new Set();
  let preferredSeedId = seedEntityId;

  while (true) {
    const group = findMergeableGroup(grid, config, preferredSeedId, heldKeys);
    if (!group) break;

    const color = group[0].color;
    const colorIndex = config.colors.indexOf(color);
    const isFinalTier = colorIndex === config.colors.length - 1;
    const nextColor = isFinalTier ? null : config.colors[colorIndex + 1];

    let placement = null;
    if (!isFinalTier) {
      placement = findPlacementNearVacated(grid, group, nextColor, config);
      if (!placement) {
        // 置き場所が無いのでこのグループは保留し、他のグループの走査を続ける
        heldKeys.add(groupKey(group));
        preferredSeedId = null;
        continue;
      }
    }

    chainIndex += 1;
    const entityIds = group.map((e) => e.id);
    grid.removeEntities(entityIds);
    // settle()は「実際に沈んだエンティティとその沈んだ量(delta)」を返す。
    // 後続の連鎖ステップでさらに動く前に、このステップ時点の沈み量をスナップショットしておく。
    const settledDeltas = grid.settle();

    let resultEntityId = null;
    let resultCells = null;
    if (placement) {
      resultEntityId = grid.placeCells(placement.worldCells, nextColor, placement.bondPairs);
      // resolveMerges()は連鎖の全ステップを先にまとめて（アニメーションなしで）処理するため、
      // この直後の連鎖ステップでこのエンティティがさらに沈むことがある。生成時点のセル座標を
      // ここでスナップショットしておき、アニメーション側（GameController._spawnMergedEntity）が
      // 後から grid.entities を読み直して「沈んだ後」の座標を誤って使わないようにする。
      resultCells = grid.entities.get(resultEntityId).cells.map((c) => ({ ...c }));
    }

    events.push({
      chainIndex,
      color,
      count: group.length,
      clearedEntityIds: entityIds,
      settledEntities: settledDeltas,
      resultColor: nextColor,
      resultEntityId,
      resultCells,
      resultBondPairs: placement ? placement.bondPairs : null,
    });

    // 盤面が変化したので、保留していたグループも含めて再評価する。
    heldKeys.clear();
    preferredSeedId = resultEntityId;
  }

  return events;
}
