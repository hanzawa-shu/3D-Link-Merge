export class SpawnManager {
  constructor(config) {
    this.config = config;
    this.current = this.pick();
    this.next = this.pick();
  }

  pick() {
    const entries = Object.entries(this.config.spawnWeights).filter(([, w]) => w > 0);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * total;
    for (const [color, weight] of entries) {
      if (roll < weight) return color;
      roll -= weight;
    }
    return entries[entries.length - 1][0];
  }

  advance() {
    this.current = this.next;
    this.next = this.pick();
    return this.current;
  }
}
