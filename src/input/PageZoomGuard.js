/**
 * ページ全体の拡大操作を無効化する。
 *
 * iOS Safari は viewport の `user-scalable=no` を無視するため、ピンチによるページ拡大は
 * WebKit 独自の gesture イベントでしか止められない（ダブルタップ側は CSS の
 * `touch-action: manipulation` が担当する）。canvas のカメラ操作は touch イベントで
 * 処理されるため、ここで gesture イベントを止めても影響を受けない。
 */
export function installPageZoomGuard(target = document) {
  const block = (event) => event.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    target.addEventListener(type, block, { passive: false });
  }
}
