import { colorHex } from "../scene/ObjectFactory.js";
import { shapeCellCount } from "../game/Config.js";

const COLOR_LABEL = {
  white: "白",
  yellow: "黄",
  red: "赤",
  blue: "青",
  green: "緑",
  purple: "紫",
  orange: "橙",
  black: "黒",
};

export class HUD {
  constructor({ config, onMove, onConfirm, onRotatePitch, onRotateYaw, onHighlightChange, onMenu }) {
    this.el = document.getElementById("screen-hud");
    this.scoreEl = document.getElementById("hud-score");
    this.nextSwatchEl = document.getElementById("hud-next-swatch");
    this.rotatePitchBtn = document.getElementById("dpad-rotate-pitch");
    this.rotateYawBtn = document.getElementById("dpad-rotate-yaw");
    this.rotatePitchLabel = document.getElementById("pad-label-pitch");
    this.rotateYawLabel = document.getElementById("pad-label-yaw");
    this.highlightContainer = document.getElementById("hud-highlight-buttons");
    this.highlightResetBtn = document.getElementById("hud-highlight-reset");
    this.onHighlightChange = onHighlightChange;
    this.highlighted = new Set();
    this.highlightButtons = [];

    document.getElementById("dpad-up").addEventListener("click", () => onMove("up"));
    document.getElementById("dpad-down").addEventListener("click", () => onMove("down"));
    document.getElementById("dpad-left").addEventListener("click", () => onMove("left"));
    document.getElementById("dpad-right").addEventListener("click", () => onMove("right"));
    document.getElementById("dpad-confirm").addEventListener("click", () => onConfirm());
    this.rotatePitchBtn.addEventListener("click", () => onRotatePitch());
    this.rotateYawBtn.addEventListener("click", () => onRotateYaw());
    document.getElementById("btn-menu").addEventListener("click", () => onMenu());
    this.highlightResetBtn.addEventListener("click", () => this.resetHighlights());

    this.rebuildHighlightButtons(config.colors);
  }

  /** カラー段階数（config.colorLevelCount）に応じて、色ハイライトボタンを作り直す。 */
  rebuildHighlightButtons(colors) {
    this.highlightContainer.innerHTML = "";
    this.highlighted.clear();
    this.highlightButtons = colors.map((color) => {
      const btn = document.createElement("button");
      btn.className = "highlight-btn";
      btn.dataset.color = color;
      btn.style.setProperty("--swatch-color", `#${colorHex(color).toString(16).padStart(6, "0")}`);
      btn.textContent = COLOR_LABEL[color] ?? color;
      btn.addEventListener("click", () => {
        if (this.highlighted.has(color)) {
          this.highlighted.delete(color);
          btn.classList.remove("active");
        } else {
          this.highlighted.add(color);
          btn.classList.add("active");
        }
        this.onHighlightChange([...this.highlighted]);
      });
      this.highlightContainer.appendChild(btn);
      return btn;
    });
  }

  /** 全ハイライト選択を解除し、盤面表示を通常状態に戻す。 */
  resetHighlights() {
    this.highlighted.clear();
    for (const btn of this.highlightButtons) btn.classList.remove("active");
    this.onHighlightChange([...this.highlighted]);
  }

  setScore(score) {
    this.scoreEl.textContent = score;
  }

  setNextColor(color) {
    this.nextSwatchEl.style.background = `#${colorHex(color).toString(16).padStart(6, "0")}`;
    this.nextSwatchEl.title = COLOR_LABEL[color] ?? color;
    // SVG 要素には disabled が無いので、クラスで無効表示に切り替える。
    const rotatable = shapeCellCount(color) > 1;
    for (const el of [this.rotatePitchBtn, this.rotateYawBtn, this.rotatePitchLabel, this.rotateYawLabel]) {
      el.classList.toggle("is-disabled", !rotatable);
    }
  }

  show() {
    this.el.classList.remove("hidden");
  }

  hide() {
    this.el.classList.add("hidden");
  }
}
