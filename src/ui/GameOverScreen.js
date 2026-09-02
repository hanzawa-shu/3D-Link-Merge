export class GameOverScreen {
  constructor({ onRetry, onTitle }) {
    this.el = document.getElementById("screen-gameover");
    this.scoreEl = document.getElementById("gameover-score");
    this.highScoreEl = document.getElementById("gameover-highscore");
    document.getElementById("btn-retry").addEventListener("click", onRetry);
    document.getElementById("btn-gameover-title").addEventListener("click", onTitle);
  }

  setResult(score, highScore) {
    this.scoreEl.textContent = score;
    this.highScoreEl.textContent = highScore;
  }

  show() {
    this.el.classList.remove("hidden");
  }

  hide() {
    this.el.classList.add("hidden");
  }
}
