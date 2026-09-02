// キー入力そのものはGameController側で受け取り、カメラの向きに応じて
// 画面上の上下左右をワールド座標のdx/dzへ変換してからmove()を呼び出す。
// このクラス自体はグリッド上のカーソル座標管理のみを担当する。
export class CursorController {
  constructor(config, { onMove, onConfirm }) {
    this.config = config;
    this.x = Math.floor(config.boardSize / 2);
    this.z = Math.floor(config.boardSize / 2);
    this.onMove = onMove;
    this.onConfirm = onConfirm;
    this.enabled = true;
  }

  move(dx, dz) {
    if (!this.enabled) return;
    const size = this.config.boardSize;
    this.x = Math.min(size - 1, Math.max(0, this.x + dx));
    this.z = Math.min(size - 1, Math.max(0, this.z + dz));
    this.onMove(this.x, this.z);
  }

  confirm() {
    if (!this.enabled) return;
    this.onConfirm(this.x, this.z);
  }
}
