// 段階の並び順。カラー段階数(colorLevelCount)で先頭から何色使うかを切り替える。
export const COLORS = ["white", "yellow", "red", "blue", "green", "purple", "orange", "black"];

// 段階ごとの基準形状。ローカル座標 (dx, dy, dz) のセルオフセットリスト。
// 基準姿勢ではdyはすべて0（平面形状）。縦回転(X軸)を加えることで立体的な向きになる。
const BASE_SHAPES = {
  white: [[0, 0, 0]],
  yellow: [[0, 0, 0], [1, 0, 0]],
  red: [[0, 0, 0], [1, 0, 0], [0, 0, 1]],
  blue: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 0, 1]],
  green: [[1, 0, 0], [0, 0, 1], [1, 0, 1], [2, 0, 1], [1, 0, 2]],
  // 6段階目: 4連＋2連の鉤型（ヘキソミノ）
  purple: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [0, 0, 1], [0, 0, 2]],
  // 7段階目: H字（ヘプトミノ）
  orange: [[0, 0, 0], [0, 0, 1], [0, 0, 2], [1, 0, 1], [2, 0, 0], [2, 0, 1], [2, 0, 2]],
  // 8段階目: 中抜きの環（オクトミノ、対称形）
  black: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 1], [2, 0, 1], [0, 0, 2], [1, 0, 2], [2, 0, 2]],
};

// 段階係数（スコア計算用）。段階が上がるごとに倍。
const TIER_COEFFICIENT = {
  white: 1,
  yellow: 2,
  red: 4,
  blue: 8,
  green: 16,
  purple: 32,
  orange: 64,
  black: 128,
};

// 直接出現しうるのは先頭4色まで（白65%/黄25%/赤8%/青2%）。
// それ以降の段階は常に合体でのみ生成される（最上位段階は常に出現率0）。
const BASE_SPAWN_WEIGHTS = [65, 25, 8, 2];

function buildSpawnWeights(colors) {
  const weights = {};
  colors.forEach((color, i) => {
    const isTopTier = i === colors.length - 1;
    weights[color] = !isTopTier && i < BASE_SPAWN_WEIGHTS.length ? BASE_SPAWN_WEIGHTS[i] : 0;
  });
  return weights;
}

// 横回転（Y軸ヨー）: (dx,dz)平面を回す。dyは変化しない。
function rotateYaw90(cells) {
  return cells.map(([dx, dy, dz]) => [dz, dy, -dx]);
}

// 縦回転（X軸ピッチ）: (dy,dz)平面を回す。dxは変化しない。
function rotatePitch90(cells) {
  return cells.map(([dx, dy, dz]) => [dx, dz, -dy]);
}

function normalize(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const minZ = Math.min(...cells.map((c) => c[2]));
  return cells.map(([x, y, z]) => [x - minX, y - minY, z - minZ]);
}

/** 基準形状に縦回転(pitch回)→横回転(yaw回)の順で90度刻みの回転を適用し、正規化して返す。 */
export function orientShape(baseCells, pitch, yaw) {
  let cells = baseCells;
  for (let i = 0; i < ((pitch % 4) + 4) % 4; i++) cells = rotatePitch90(cells);
  for (let i = 0; i < ((yaw % 4) + 4) % 4; i++) cells = rotateYaw90(cells);
  return normalize(cells);
}

export function shapeCellCount(color) {
  return BASE_SHAPES[color].length;
}

/**
 * 回転後・着地前のローカルセルオフセット `[[dx,dy,dz], ...]` を受け取り、立体的に直接隣接する
 * （3軸のマンハッタン距離が1の）セルのインデックスペア `[i, j]` を返す。
 * 形状自身が持つ「どのセル同士が隣接するはずか」という構造は、着地時の地形追従で絶対座標が
 * 離れても変化しない不変の情報のため、着地後のワールド座標ではなくここで一度だけ計算し、
 * エンティティに保持させて使い回す（紐＝ボンド表示の対象ペアを決めるのに使う）。
 */
export function computeLocalBondIndexPairs(localCells) {
  const pairs = [];
  for (let i = 0; i < localCells.length; i++) {
    for (let j = i + 1; j < localCells.length; j++) {
      const [ax, ay, az] = localCells[i];
      const [bx, by, bz] = localCells[j];
      const dist = Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz);
      if (dist === 1) pairs.push([i, j]);
    }
  }
  return pairs;
}

/** config.colorLevelCountに応じて、colors/baseShapes/tierCoefficient/spawnWeightsを再計算する。 */
function deriveColorLevelFields(config) {
  const colors = COLORS.slice(0, config.colorLevelCount);
  return {
    colors,
    baseShapes: Object.fromEntries(colors.map((c) => [c, BASE_SHAPES[c].map((cell) => [...cell])])),
    tierCoefficient: Object.fromEntries(colors.map((c) => [c, TIER_COEFFICIENT[c]])),
    spawnWeights: buildSpawnWeights(colors),
  };
}

export const CONFIG = {
  boardSize: 4,
  maxHeight: 5,
  colorLevelCount: 7,
  mergeThreshold: 4,
  cellSize: 1,
  maxAdjacentHeightDiff: 1,
  excessBonusPerPiece: 0.5,
  chainMultiplierStep: 0.5,
  topTierClearBonus: 5000,
};

export function cloneDefaultConfig() {
  return { ...CONFIG, ...deriveColorLevelFields(CONFIG) };
}

/**
 * 盤面サイズ・カラー段階数などの設定変更後、次のゲーム開始前に呼び出す。
 * colorLevelCountに応じたcolors/baseShapes/tierCoefficient/spawnWeightsを
 * configオブジェクトに直接（同じ参照のまま）反映する。
 */
export function applyDerivedConfig(config) {
  Object.assign(config, deriveColorLevelFields(config));
  return config;
}
