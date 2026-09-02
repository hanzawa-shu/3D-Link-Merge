export class TitleScreen {
  constructor({ onStart, onRules, onSettings }) {
    this.el = document.getElementById("screen-title");
    this.highScoreEl = document.getElementById("title-highscore");
    document.getElementById("btn-start").addEventListener("click", onStart);
    document.getElementById("btn-rules").addEventListener("click", onRules);
    document.getElementById("btn-settings").addEventListener("click", onSettings);
  }

  setHighScore(score) {
    this.highScoreEl.textContent = score;
  }

  show() {
    this.el.classList.remove("hidden");
  }

  hide() {
    this.el.classList.add("hidden");
  }
}
