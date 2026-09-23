/**
 * TEMPORARY CRT screen diagnostic — DIAGNOSIS ONLY.
 *
 * Boots the live stage, dumps screen-mesh UV/geometry facts, writes:
 *   public/debug/crt-uv-layout.png   (Image A — UV triangles)
 *   public/debug/crt-testgrid.png    (Image B — numbered grid on CRT at stop 1)
 *
 * Reverts the MySpace canvas / phosphor intensity before exit.
 * Does not modify materials, geometry, fog, or lighting permanently.
 *
 * Run: node scripts/crt-screen-diagnose.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/debug");
const PORT = 5175;
const BOOT_MS = 90_000;
const HOP_MS = 20_000;

function dataUrlToBuffer(dataUrl) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("expected png data URL");
  return Buffer.from(m[1], "base64");
}

const server = await createServer({
  root: ROOT,
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();
const origin = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i += 1) {
  try {
    const res = await fetch(origin);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
    if (i === 49) throw new Error(`Vite did not accept connections on ${origin}`);
  }
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`✗ ${msg}`);
};

try {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const stage = window.__stage;
      const desktop = stage?.vignettes?.[1]?.instance;
      return Boolean(
        stage &&
          stage.introComplete &&
          !stage.locked &&
          stage.cameraRig?.state?.isSettled &&
          desktop?.pcRoot &&
          desktop?.screenMesh
      );
    },
    { timeout: BOOT_MS }
  );

  // Stop 1 rest — Desktop CRT facing camera.
  await page.evaluate(() => window.__stage.goTo(1));
  await page.waitForFunction(
    () =>
      Boolean(
        window.__stage?.cameraRig?.state?.isSettled &&
          window.__stage?.cameraRig?.state?.index === 1
      ),
    { timeout: HOP_MS }
  );
  // Settle a couple frames for lighting / CRT update.
  await page.waitForTimeout(400);

  const report = await page.evaluate(() => {
    const desktop = window.__stage.vignettes[1].instance;
    const mesh = desktop.screenMesh;
    const glass = desktop.glassMesh;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const index = geo.index;

    let triCount = 0;
    if (index) triCount = index.count / 3;
    else triCount = pos.count / 3;

    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const size = {
      x: box.max.x - box.min.x,
      y: box.max.y - box.min.y,
      z: box.max.z - box.min.z
    };
    const axes = [
      { axis: "x", span: size.x },
      { axis: "y", span: size.y },
      { axis: "z", span: size.z }
    ].sort((a, b) => a.span - b.span);
    const thin = axes[0];
    const isFlatish = thin.span < Math.max(axes[1].span, axes[2].span) * 0.08;

    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    if (uv) {
      for (let i = 0; i < uv.count; i += 1) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        uMin = Math.min(uMin, u);
        uMax = Math.max(uMax, u);
        vMin = Math.min(vMin, v);
        vMax = Math.max(vMax, v);
      }
    }

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const matInfo = mats.map((m) => ({
      name: m?.name ?? null,
      type: m?.type ?? m?.constructor?.name ?? null,
      hasEmissiveMap: Boolean(m?.emissiveMap),
      hasMap: Boolean(m?.map),
      emissiveIntensity: m?.emissiveIntensity ?? null,
      crtScreen: Boolean(m?.userData?.crtScreen)
    }));

    let glassInfo = null;
    if (glass?.geometry?.attributes?.position) {
      glass.geometry.computeBoundingBox();
      const gb = glass.geometry.boundingBox;
      glassInfo = {
        name: glass.name,
        size: {
          x: gb.max.x - gb.min.x,
          y: gb.max.y - gb.min.y,
          z: gb.max.z - gb.min.z
        },
        note: "cloned BEFORE phosphor flatten — authored bulge depth"
      };
    }

    const metrics = desktop.debugCrtScreen?.() ?? desktop._crtMetrics ?? null;

    return {
      meshName: mesh.name,
      vertCount: pos.count,
      triCount,
      hasIndex: Boolean(index),
      hasUv: Boolean(uv),
      uvBounds: uv
        ? { uMin, uMax, vMin, vMax, uSpan: uMax - uMin, vSpan: vMax - vMin }
        : null,
      localBBox: {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
        size,
        thinnestAxis: thin.axis,
        thinnestSpan: thin.span,
        flatAfterFlatten: isFlatish
      },
      materials: matInfo,
      glassShell: glassInfo,
      metrics,
      mySpaceCanvas: {
        w: desktop.mySpace?.canvas?.width ?? null,
        h: desktop.mySpace?.canvas?.height ?? null
      }
    };
  });

  console.log("\n=== CRT screen mesh facts ===");
  console.log(JSON.stringify(report, null, 2));

  // Image A — UV layout
  const uvPng = await page.evaluate(() => {
    const mesh = window.__stage.vignettes[1].instance.screenMesh;
    const geo = mesh.geometry;
    const uv = geo.attributes.uv;
    const index = geo.index;
    const S = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#111418";
    ctx.fillRect(0, 0, S, S);

    // 0..1 unit square
    ctx.strokeStyle = "#4af0ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i += 1) {
      const t = (i / 8) * S;
      ctx.beginPath();
      ctx.moveTo(t, 0);
      ctx.lineTo(t, S);
      ctx.moveTo(0, t);
      ctx.lineTo(S, t);
      ctx.stroke();
    }

    const toX = (u) => u * S;
    // Canvas Y down; UV V up — flip so V=1 is top of image (matches CRT flipY:false top = low V? )
    // Draw with V=0 at bottom so UV space matches standard UV diagram (V up).
    const toY = (v) => (1 - v) * S;

    const drawTri = (i0, i1, i2) => {
      const u0 = uv.getX(i0);
      const v0 = uv.getY(i0);
      const u1 = uv.getX(i1);
      const v1 = uv.getY(i1);
      const u2 = uv.getX(i2);
      const v2 = uv.getY(i2);
      ctx.beginPath();
      ctx.moveTo(toX(u0), toY(v0));
      ctx.lineTo(toX(u1), toY(v1));
      ctx.lineTo(toX(u2), toY(v2));
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 180, 64, 0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 210, 120, 0.85)";
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        drawTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (let i = 0; i < uv.count; i += 3) drawTri(i, i + 1, i + 2);
    }

    // UV AABB of island
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 0; i < uv.count; i += 1) {
      uMin = Math.min(uMin, uv.getX(i));
      uMax = Math.max(uMax, uv.getX(i));
      vMin = Math.min(vMin, uv.getY(i));
      vMax = Math.max(vMax, uv.getY(i));
    }
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(toX(uMin), toY(vMax), toX(uMax) - toX(uMin), toY(vMin) - toY(vMax));
    ctx.setLineDash([]);

    ctx.fillStyle = "#e8f4ff";
    ctx.font = "14px ui-monospace, Menlo, monospace";
    ctx.fillText("cyan = 0..1 UV box", 12, 22);
    ctx.fillText("red dashed = UV island AABB", 12, 42);
    ctx.fillText(
      `u[${uMin.toFixed(3)},${uMax.toFixed(3)}] v[${vMin.toFixed(3)},${vMax.toFixed(3)}]`,
      12,
      62
    );
    ctx.fillText("V↑ (1 at top of image)", 12, S - 16);

    return canvas.toDataURL("image/png");
  });
  await writeFile(join(OUT_DIR, "crt-uv-layout.png"), dataUrlToBuffer(uvPng));
  console.log("✓ wrote public/debug/crt-uv-layout.png");

  // Image B — numbered test grid via the SAME CanvasTexture / emissiveMap pipeline.
  // Stub per-frame glow sync — otherwise _syncScreenGlow zeros intensity every rAF.
  await page.evaluate(() => {
    const desktop = window.__stage.vignettes[1].instance;
    const ms = desktop.mySpace;
    const mat = Array.isArray(desktop.screenMesh.material)
      ? desktop.screenMesh.material.find((m) => m?.userData?.crtScreen) ||
        desktop.screenMesh.material[0]
      : desktop.screenMesh.material;

    desktop._syncScreenGlow = () => {};
    desktop._syncPowerLedState = () => {};
    ms.draw = () => {};
    ms.drawOff = () => {};
    ms.isMonitorBooting = false;

    const canvas = ms.canvas;
    const ctx = ms.ctx;
    const w = canvas.width;
    const h = canvas.height;

    const backup = document.createElement("canvas");
    backup.width = w;
    backup.height = h;
    backup.getContext("2d").drawImage(canvas, 0, 0);
    window.__crtDiagBackup = {
      canvas: backup,
      emissiveIntensity: mat.emissiveIntensity,
      toneMapped: mat.toneMapped
    };

    const cols = 8;
    const rows = 6;
    const cellW = w / cols;
    const cellH = h / rows;
    const palette = [
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffff00",
      "#ff00ff",
      "#00ffff",
      "#ffffff",
      "#ff8800"
    ];
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = col * cellW;
        const y = row * cellH;
        const n = row * cols + col + 1;
        ctx.fillStyle = palette[(col + row) % palette.length];
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
        ctx.fillStyle = "#000";
        ctx.font = `bold ${Math.floor(Math.min(cellW, cellH) * 0.42)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(n), x + cellW / 2, y + cellH / 2);
      }
    }
    const mark = (x, y, label, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x - 48, y - 48, 96, 96);
      ctx.fillStyle = "#000";
      ctx.font = "bold 40px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y);
    };
    mark(70, 70, "TL", "#ff00ff");
    mark(w - 70, 70, "TR", "#00ffff");
    mark(70, h - 70, "BL", "#ffff00");
    mark(w - 70, h - 70, "BR", "#00ff00");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    mat.emissiveMap = ms.texture;
    mat.emissive.setRGB(1, 1, 1);
    mat.emissiveIntensity = 1.0;
    // Diagnostic only — ACES otherwise crushes the grid; restored on revert via reload.
    mat.toneMapped = false;
    mat.needsUpdate = true;
    ms.texture.needsUpdate = true;
  });

  // Soft dolly (do NOT set isZoomed — that boots XP and overwrites the canvas).
  await page.evaluate(() => {
    const rig = window.__stage.cameraRig;
    const s = rig.state;
    s.radialOffsetTarget = (rig.zoomRadius - rig.restRadius) * 0.55;
    s.heightTarget = rig.restHeight * 0.92 + rig.zoomHeight * 0.08;
  });
  await page.waitForTimeout(1200);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );

  const shot = await page.locator("#scene-canvas").screenshot({ type: "png" });
  await writeFile(join(OUT_DIR, "crt-testgrid.png"), shot);
  console.log("✓ wrote public/debug/crt-testgrid.png");

  // REVERT via reload — restores stubs, materials, camera, MySpace canvas.
  await page.reload({ waitUntil: "domcontentloaded" });
  console.log("✓ reverted via reload (stubs + canvas + intensity)");

  // Conclusion helpers printed for the agent report
  const uv = report.uvBounds;
  const unitRect =
    uv &&
    uv.uMin > -0.02 &&
    uv.vMin > -0.02 &&
    uv.uMax < 1.02 &&
    uv.vMax < 1.02 &&
    uv.uSpan > 0.85 &&
    uv.vSpan > 0.85;
  console.log("\n=== heuristic (agent must confirm from PNGs) ===");
  console.log(
    unitRect
      ? "UV AABB is near-unit (code heuristic: Path 1 viable IF island is rectangular in Image A)."
      : "UV AABB is a sub-island / irregular (code heuristic: Path 1 questionable)."
  );
} catch (error) {
  fail(error.stack || error.message || String(error));
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error("\nCRT diagnose: failed");
  process.exit(1);
}
console.log("\nCRT diagnose: done (diagnostic only — no pipeline changes kept)");
