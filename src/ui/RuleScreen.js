export class RuleScreen {
  constructor({ onBack }) {
    this.el = document.getElementById("screen-rules");
    document.getElementById("btn-rules-back").addEventListener("click", onBack);
  }

  show() {
    this.el.classList.remove("hidden");
  }

  hide() {
    this.el.classList.add("hidden");
  }
}
