const activeTweens = new Set();

function easeOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

export function animateValue({ from, to, duration, easing = (t) => t, onUpdate, onComplete }) {
  const start = performance.now();
  const tween = {
    tick(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easing(t);
      onUpdate(from + (to - from) * eased);
      if (t >= 1) {
        activeTweens.delete(tween);
        if (onComplete) onComplete();
      }
    },
  };
  activeTweens.add(tween);
  return tween;
}

export function animateDrop({ from, to, duration = 420, onUpdate, onComplete }) {
  return animateValue({ from, to, duration, easing: easeOutBounce, onUpdate, onComplete });
}

export function updateTweens(now) {
  for (const tween of activeTweens) tween.tick(now);
}

export function animateDropAsync(mesh, fromY, toY, duration = 420) {
  return new Promise((resolve) => {
    animateDrop({
      from: fromY,
      to: toY,
      duration,
      onUpdate: (y) => {
        mesh.position.y = y;
      },
      onComplete: resolve,
    });
  });
}

export function animateScaleAsync(mesh, fromScale, toScale, duration = 220) {
  return new Promise((resolve) => {
    animateValue({
      from: fromScale,
      to: toScale,
      duration,
      easing: (t) => t * (2 - t),
      onUpdate: (s) => mesh.scale.setScalar(s),
      onComplete: resolve,
    });
  });
}
