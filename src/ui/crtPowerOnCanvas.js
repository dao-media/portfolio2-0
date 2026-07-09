/** CRT warm-up frame — horizontal beam, vertical expand, brief flash (t ∈ 0…1). */
export function renderCrtPowerOnFrame(ctx, width, height, t) {
  const win = { x: 0, y: 0, w: width, h: height };
  const cx = win.x + win.w / 2;
  const cy = win.y + win.h / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#030403";
  ctx.fillRect(0, 0, width, height);

  if (t < 0.07) return;

  let halfW;
  let halfH;
  if (t < 0.24) {
    const u = (t - 0.07) / 0.17;
    halfW = win.w * 0.42 * u;
    halfH = 2;
  } else if (t < 0.58) {
    const u = (t - 0.24) / 0.34;
    const eased = 1 - Math.pow(1 - u, 2.4);
    halfW = win.w * (0.42 + 0.06 * eased);
    halfH = win.h * 0.5 * eased;
  } else {
    halfW = win.w;
    halfH = win.h;
  }

  ctx.save();
  ctx.fillStyle = "#030403";
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.rect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
  ctx.fill("evenodd");

  if (t < 0.3) {
    const glow = 1 - (t - 0.07) / 0.23;
    ctx.fillStyle = `rgba(160, 255, 130, ${0.42 * glow})`;
    ctx.fillRect(cx - win.w * 0.44, cy - 2.5, win.w * 0.88, 5);
  }

  if (t > 0.52 && t < 0.82) {
    const flash = 1 - (t - 0.52) / 0.3;
    ctx.fillStyle = `rgba(245, 255, 235, ${flash * 0.38})`;
    ctx.fillRect(win.x, win.y, win.w, win.h);
  }

  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx */
export function playCrtPowerOnAnimation(ctx, width, height, durationMs, onFrame) {
  return new Promise((resolve) => {
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      renderCrtPowerOnFrame(ctx, width, height, t);
      onFrame?.();
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };

    requestAnimationFrame(tick);
  });
}
