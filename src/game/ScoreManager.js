export function computeMergeScore(events, config) {
  let total = 0;
  for (const ev of events) {
    const tierCoefficient = config.tierCoefficient[ev.color];
    const base = tierCoefficient * ev.count;
    const excess = Math.max(0, ev.count - config.mergeThreshold);
    const excessMultiplier = 1 + excess * config.excessBonusPerPiece;
    const chainMultiplier =
      ev.chainIndex >= 2 ? 1 + (ev.chainIndex - 1) * config.chainMultiplierStep : 1;

    let score = base * excessMultiplier * chainMultiplier;
    if (ev.resultColor === null) {
      score += config.topTierClearBonus;
    }
    total += Math.round(score);
  }
  return total;
}

const HIGH_SCORE_KEY = "demo1_highscore";

export function loadHighScore() {
  const raw = localStorage.getItem(HIGH_SCORE_KEY);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function saveHighScore(score) {
  localStorage.setItem(HIGH_SCORE_KEY, String(score));
}

export function resetHighScore() {
  localStorage.removeItem(HIGH_SCORE_KEY);
}
