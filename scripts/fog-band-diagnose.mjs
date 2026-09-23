/**
 * Prove fog horizontal bands = flat Y=0.05 annulus collapse at grazing POV.
 * Screenshots + projected screen-Y for near arc / hole / far arc. No fog edits.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5177;
const OUT = "public/debug";
const BOOT_MS = 120_000;

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () =>
    Boolean(
      window.__stage?.introComplete &&
        !window.__stage?.locked &&
        window.__stage?.cameraRig?.state?.isSettled
    ),
  { timeout: BOOT_MS }
);
await page.waitForTimeout(4000);

mkdirSync(OUT, { recursive: true });

/** Install a camera pin that wins over cameraRig.update before beauty. */
async function installPinHook() {
  await page.evaluate(() => {
    const stage = window.__stage;
    if (stage._fogBandHooked) return;
    stage._fogBandHooked = true;
    const rig = stage.cameraRig;
    const prevUpdate = rig.update.bind(rig);
    rig.update = (dt) => {
      const pin = stage._fogBandPin;
      if (pin) {
        stage.camera.position.set(pin.x, pin.y, pin.z);
        stage.camera.up.set(0, 0, -1); // top-down: keep +Z toward bottom of frame
        if (pin.up) stage.camera.up.set(pin.up[0], pin.up[1], pin.up[2]);
        stage.camera.lookAt(pin.lookX ?? 0, pin.lookY ?? 0, pin.lookZ ?? 0);
        stage.camera.updateMatrixWorld(true);
        return;
      }
      prevUpdate(dt);
    };
  });
}

/**
 * Project origin-centered annulus samples.
 * Azimuth: when camera is on +Y, use world +Z as "near".
 */
function projectRing(label) {
  return page.evaluate((tag) => {
    const stage = window.__stage;
    const camera = stage.camera;
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const neon = stage.neon;
    const fogY = neon?.fogRing?.position?.y ?? 0.05;
    const rInner = 14;
    const rOuter = 22;
    const cam = camera.position;
    const camR = Math.hypot(cam.x, cam.z);
    let ux;
    let uz;
    if (camR < 0.01) {
      // Top-down: treat world +Z as near.
      ux = 0;
      uz = 1;
    } else {
      ux = cam.x / camR;
      uz = cam.z / camR;
    }
    const rx = -uz;
    const rz = ux;

    const project = (x, y, z) => {
      const vec = cam.clone().set(x, y, z);
      vec.project(camera);
      return {
        world: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))],
        ndc: [Number(vec.x.toFixed(4)), Number(vec.y.toFixed(4))],
        screenY: Number(((1 - vec.y) * 0.5).toFixed(4)),
        screenX: Number(((vec.x + 1) * 0.5).toFixed(4)),
        behind: vec.z > 1 || vec.z < -1
      };
    };

    const pts = {
      nearOuter: project(ux * rOuter, fogY, uz * rOuter),
      nearInner: project(ux * rInner, fogY, uz * rInner),
      hole: project(0, fogY, 0),
      farInner: project(-ux * rInner, fogY, -uz * rInner),
      farOuter: project(-ux * rOuter, fogY, -uz * rOuter),
      sideOuterL: project(rx * rOuter, fogY, rz * rOuter),
      sideOuterR: project(-rx * rOuter, fogY, -rz * rOuter)
    };

    const ordered = ["farOuter", "farInner", "hole", "nearInner", "nearOuter"].map(
      (k) => ({ k, y: pts[k].screenY, x: pts[k].screenX })
    );
    const ys = ordered.map((o) => o.y);
    const stacksTopToBottom = ys.every((y, i) => i === 0 || y >= ys[i - 1] - 1e-4);

    return {
      tag,
      fogY,
      hazeTotal: neon?.debugState?.()?.hazeTotal ?? null,
      hazeVisible: neon?.debugState?.()?.hazeVisible ?? null,
      ring: neon?.debugState?.()?.ring ?? null,
      fogVisible: neon?.fogRing?.visible ?? null,
      camera: {
        x: Number(cam.x.toFixed(3)),
        y: Number(cam.y.toFixed(3)),
        z: Number(cam.z.toFixed(3))
      },
      pts,
      screenYOrder: ordered,
      stacksTopToBottom,
      bandSpanScreenY: Number(
        Math.abs(pts.nearOuter.screenY - pts.farOuter.screenY).toFixed(4)
      )
    };
  }, label);
}

async function shot(name) {
  await page.waitForTimeout(250);
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}.png` });
}

await installPinHook();

const baseline = await page.evaluate(() => ({
  fog: window.__stage.debugNeon?.() ?? window.__stage.neon?.debugState?.(),
  capture: window.__stage.debugFogCapture?.(),
  isolate: window.__stage.debugFogIsolate?.({}),
  camY: window.__stage.camera.position.y
}));

// --- A: grazing rest — floor off, feather 0 so only the annulus reads ---
await page.evaluate(() => {
  window.__stage.debugFogVis("off");
  window.__stage.debugFogIsolate({ floor: false, feather: 0, fog: true });
});
const grazingProj = await projectRing("grazing-feather0-nofloor");
await shot("fog-band-grazing-feather0");

await page.evaluate(() => {
  window.__stage.debugFogIsolate({ floor: true, feather: 2.5, fog: true });
});
await shot("fog-band-grazing-rest");

await page.evaluate(() => window.__stage.debugFogVis("both"));
await shot("fog-band-grazing-vis-both");
await page.evaluate(() => window.__stage.debugFogVis("off"));

// --- B: true top-down from stage center ---
await page.evaluate(() => {
  const stage = window.__stage;
  stage._fogBandPrevFov = stage.camera.fov;
  // FOV 42° at 28 m only sees ~10.7 m of floor — inside rInner 14. Widen so the annulus fits.
  stage.camera.fov = 90;
  stage.camera.updateProjectionMatrix();
  stage._fogBandPin = {
    x: 0,
    y: 40,
    z: 0,
    lookX: 0,
    lookY: 0,
    lookZ: 0,
    up: [0, 0, -1]
  };
  stage.debugFogIsolate({ floor: false, feather: 0, fog: true });
});
await page.waitForTimeout(200);
const raisedProj = await projectRing("topdown-40m-fov90-feather0-nofloor");
await shot("fog-band-raised-feather0");

await page.evaluate(() => {
  window.__stage.debugFogIsolate({ floor: true, feather: 2.5, fog: true });
});
await shot("fog-band-raised-rest");

await page.evaluate(() => {
  const stage = window.__stage;
  stage._fogBandPin = null;
  if (stage._fogBandPrevFov != null) {
    stage.camera.fov = stage._fogBandPrevFov;
    stage.camera.updateProjectionMatrix();
  }
  stage.debugFogIsolate({ floor: true, feather: 2.5, fog: true });
  stage.debugFogVis("off");
});

const report = {
  hypothesis:
    "Flat Y=0.05 annulus at grazing projects near arc, central hole, far arc as separate horizontal bands. Haze is off so bare ring is misjudged as whole fog.",
  baseline,
  grazingProj,
  raisedProj,
  verdict: {
    hazeOff: (baseline.fog?.hazeTotal ?? -1) === 0,
    grazingStacksTopToBottom: grazingProj.stacksTopToBottom,
    grazingBandSpan: grazingProj.bandSpanScreenY,
    raisedBandSpan: raisedProj.bandSpanScreenY,
    // Top-down: hole near image center; near/far outer opposite on screen Y.
    raisedLooksLikeAnnulus:
      Math.abs(raisedProj.pts.hole.screenY - 0.5) < 0.05 &&
      Math.abs(raisedProj.pts.hole.screenX - 0.5) < 0.05 &&
      Math.abs(raisedProj.pts.nearOuter.screenY - raisedProj.pts.farOuter.screenY) > 0.15 &&
      Math.abs(raisedProj.pts.nearOuter.screenX - 0.5) < 0.08 &&
      Math.abs(raisedProj.pts.farOuter.screenX - 0.5) < 0.08
  }
};

writeFileSync(`${OUT}/fog-band-diagnose.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.verdict, null, 2));
console.log("grazing screenY order:", grazingProj.screenYOrder);
console.log("raised screenY order:", raisedProj.screenYOrder);
console.log(`wrote ${OUT}/fog-band-diagnose.json + screenshots`);

await browser.close();
await server.close();
