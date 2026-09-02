import { cloneDefaultConfig, applyDerivedConfig } from "./game/Config.js";
import { SceneManager } from "./scene/SceneManager.js";
import { GameController } from "./game/GameController.js";
import { updateTweens } from "./scene/Tween.js";
import { installPageZoomGuard } from "./input/PageZoomGuard.js";
import { loadHighScore, saveHighScore } from "./game/ScoreManager.js";
import { TitleScreen } from "./ui/TitleScreen.js";
import { RuleScreen } from "./ui/RuleScreen.js";
import { SettingsScreen } from "./ui/SettingsScreen.js";
import { HUD } from "./ui/HUD.js";
import { GameOverScreen } from "./ui/GameOverScreen.js";
import { PauseScreen } from "./ui/PauseScreen.js";

const config = cloneDefaultConfig();
const canvas = document.getElementById("game-canvas");

let sceneManager = null;
let gameController = null;

function setCanvasVisible(visible) {
  canvas.style.visibility = visible ? "visible" : "hidden";
}

function hideAllScreens() {
  titleScreen.hide();
  ruleScreen.hide();
  settingsScreen.hide();
  hud.hide();
  pauseScreen.hide();
  gameOverScreen.hide();
}

function handleQuitToTitle() {
  if (gameController && !gameController.gameOver) {
    const best = loadHighScore();
    if (gameController.score > best) saveHighScore(gameController.score);
  }
  hideAllScreens();
  setCanvasVisible(false);
  titleScreen.setHighScore(loadHighScore());
  titleScreen.show();
}

function startNewGame() {
  // 盤面サイズ・カラー段階数の設定変更を反映してから開始する。
  applyDerivedConfig(config);

  if (sceneManager) sceneManager.dispose();
  sceneManager = new SceneManager(canvas, config);
  if (gameController) gameController.dispose();

  hud.rebuildHighlightButtons(config.colors);
  gameController = new GameController({
    sceneManager,
    config,
    hud,
    onGameOver: handleGameOver,
  });
}

function handleGameOver(score) {
  const best = loadHighScore();
  if (score > best) saveHighScore(score);
  hud.hide();
  gameOverScreen.setResult(score, loadHighScore());
  gameOverScreen.show();
}

const titleScreen = new TitleScreen({
  onStart: () => {
    hideAllScreens();
    setCanvasVisible(true);
    startNewGame();
    hud.show();
  },
  onRules: () => {
    hideAllScreens();
    ruleScreen.show();
  },
  onSettings: () => {
    hideAllScreens();
    settingsScreen.show();
  },
});

const ruleScreen = new RuleScreen({
  onBack: () => {
    hideAllScreens();
    titleScreen.setHighScore(loadHighScore());
    titleScreen.show();
  },
});

const settingsScreen = new SettingsScreen({
  config,
  onBack: () => {
    hideAllScreens();
    titleScreen.setHighScore(loadHighScore());
    titleScreen.show();
  },
  onHighScoreReset: () => titleScreen.setHighScore(loadHighScore()),
});

const hud = new HUD({
  config,
  onMove: (dir) => gameController && gameController.moveCursor(dir),
  onConfirm: () => gameController && gameController.confirmDrop(),
  onRotatePitch: () => gameController && gameController.rotatePitch(),
  onRotateYaw: () => gameController && gameController.rotateYaw(),
  onHighlightChange: (colors) => gameController && gameController.setHighlightedColors(colors),
  onMenu: () => {
    if (!gameController) return;
    gameController.pause();
    hud.hide();
    pauseScreen.show();
  },
});

const pauseScreen = new PauseScreen({
  onResume: () => {
    pauseScreen.hide();
    hud.show();
    gameController && gameController.resume();
  },
  onQuitToTitle: handleQuitToTitle,
});

const gameOverScreen = new GameOverScreen({
  onRetry: () => {
    hideAllScreens();
    startNewGame();
    hud.show();
  },
  onTitle: () => {
    hideAllScreens();
    setCanvasVisible(false);
    titleScreen.setHighScore(loadHighScore());
    titleScreen.show();
  },
});

installPageZoomGuard();

setCanvasVisible(false);
titleScreen.setHighScore(loadHighScore());
titleScreen.show();

function animate(now) {
  requestAnimationFrame(animate);
  updateTweens(now);
  if (gameController) gameController.update(now);
  if (sceneManager) sceneManager.render();
}
requestAnimationFrame(animate);
