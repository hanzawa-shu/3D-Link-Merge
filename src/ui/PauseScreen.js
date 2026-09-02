export class PauseScreen {
  constructor({ onResume, onQuitToTitle }) {
    this.el = document.getElementById("screen-pause");
    document.getElementById("btn-resume").addEventListener("click", onResume);
    document.getElementById("btn-quit-title").addEventListener("click", onQuitToTitle);
  }

  show() {
    this.el.classList.remove("hidden");
  }

  hide() {
    this.el.classList.add("hidden");
  }
}
