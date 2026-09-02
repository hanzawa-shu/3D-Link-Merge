import { resetHighScore } from "../game/ScoreManager.js";

export class SettingsScreen {
  constructor({ config, onBack, onHighScoreReset }) {
    this.el = document.getElementById("screen-settings");
    this.config = config;

    this.boardSizeInput = document.getElementById("setting-boardsize");
    this.boardSizeValue = document.getElementById("setting-boardsize-value");
    this.boardSizeInput.value = String(config.boardSize);
    this.boardSizeValue.textContent = String(config.boardSize);
    this.boardSizeInput.addEventListener("input", () => {
      const value = Number(this.boardSizeInput.value);
      this.config.boardSize = value;
      this.boardSizeValue.textContent = String(value);
    });

    this.colorLevelsInput = document.getElementById("setting-colorlevels");
    this.colorLevelsValue = document.getElementById("setting-colorlevels-value");
    this.colorLevelsInput.value = String(config.colorLevelCount);
    this.colorLevelsValue.textContent = String(config.colorLevelCount);
    this.colorLevelsInput.addEventListener("input", () => {
      const value = Number(this.colorLevelsInput.value);
      this.config.colorLevelCount = value;
      this.colorLevelsValue.textContent = String(value);
    });

    this.maxHeightInput = document.getElementById("setting-maxheight");
    this.maxHeightValue = document.getElementById("setting-maxheight-value");
    this.maxHeightInput.value = String(config.maxHeight);
    this.maxHeightValue.textContent = String(config.maxHeight);

    this.maxHeightInput.addEventListener("input", () => {
      const value = Number(this.maxHeightInput.value);
      this.config.maxHeight = value;
      this.maxHeightValue.textContent = String(value);
    });

    document.getElementById("btn-reset-highscore").addEventListener("click", () => {
      resetHighScore();
      if (onHighScoreReset) onHighScoreReset();
    });

    document.getElementById("btn-settings-back").addEventListener("click", onBack);
  }

  show() {
    this.el.classList.remove("hidden");
  }

  hide() {
    this.el.classList.add("hidden");
  }
}
