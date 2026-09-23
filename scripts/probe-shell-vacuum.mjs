import { chromium } from "playwright";
import fs from "fs";
import { spawnSync } from "child_process";
import * as THREE from "three";

const PORT = process.env.PORT || 5177;
const OUT = "public/debug";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});
await page.waitForFunction(() => Boolean(window.__stage), { timeout: 60000 });
for (let i = 0; i < 120; i++) {
  await page.evaluate(() => {
    document.querySelectorAll("button").forEach((b) => {
      const t = (b.textContent || "").toLowerCase();
      if (t.includes("skip") || t.includes("power") || t.includes("dane")) {
        try {
          b.click();
        } catch {
          /* ignore */
        }
      }
    });
  });
  if (await page.evaluate(() => Boolean(window.__stage?.introComplete))) break;
  await page.waitForTimeout(80);
}
await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
  timeout: 120000
});
await page.waitForTimeout(1200);

const enums = {
  OneFactor: THREE.OneFactor,
  ZeroFactor: THREE.ZeroFactor,
  CustomBlending: THREE.CustomBlending
};

const shellState = await page.evaluate((e) => {
  const shells = [];
  window.__stage.scene.traverse((o) => {
    if (o.name !== "neon-tube-halo" || !o.material) return;
    const m = o.material;
    shells.push({
      okOneOne:
        m.blending === e.CustomBlending &&
        m.blendSrc === e.OneFactor &&
        m.blendDst === e.OneFactor &&
        m.blendSrcAlpha === e.ZeroFactor &&
        m.blendDstAlpha === e.OneFactor &&
        m.transparent === true &&
        m.depthWrite === false,
      fragAlpha0: (m.fragmentShader || "").includes("vec4(col, 0.0)"),
      uIntensity: m.uniforms?.uIntensity?.value,
      uRadius: m.uniforms?.uRadius?.value,
      depthWrite: m.depthWrite,
      transparent: m.transparent,
      blendSrc: m.blendSrc,
      blendDst: m.blendDst
    });
  });
  return shells;
}, enums);

async function tubeScreen() {
  return page.evaluate(() => {
    let tube = null;
    window.__stage.scene.traverse((o) => {
      if (o.name === "neon-tube") tube = o;
    });
    const canvas = document.querySelector("#scene-canvas");
    const rect = canvas.getBoundingClientRect();
    const vv = tube.position.clone();
    tube.getWorldPosition(vv);
    vv.project(window.__stage.camera);
    return {
      cx: (vv.x * 0.5 + 0.5) * canvas.width,
      cy: (-vv.y * 0.5 + 0.5) * canvas.height,
      cssW: rect.width,
      cssH: rect.height,
      bufW: canvas.width,
      bufH: canvas.height
    };
  });
}

function restoreAll() {
  return page.evaluate(() => {
    window.__stage.scene.traverse((o) => {
      if (o.userData._vacVis != null) {
        o.visible = o.userData._vacVis;
        delete o.userData._vacVis;
      }
    });
    if (window.__stage.volumetricFog) {
      window.__stage.volumetricFog.enabled = true;
      window.__stage.volumetricFog.setDensityScale?.(1);
    }
  });
}

async function capture(label, setup) {
  await restoreAll();
  await page.evaluate(setup);
  await page.waitForTimeout(280);
  const path = `${OUT}/c09i-${label}.png`;
  await page.locator("#scene-canvas").screenshot({ path });
  const tube = await tubeScreen();
  const crop = `${OUT}/c09i-${label}-crop.png`;
  // PIL crop around tube
  const py = `
from PIL import Image
import json
im=Image.open("${path}").convert("RGB")
w,h=im.size
cx,cy=${Math.round(tube.cx)},${Math.round(tube.cy)}
# tube coords are drawing-buffer; screenshot may be CSS pixels
sx=w/${tube.bufW}; sy=h/${tube.bufH}
cx=int(cx*sx); cy=int(cy*sy)
size=360
x0=max(0,cx-size//2); y0=max(0,cy-size//2)
x1=min(w,x0+size); y1=min(h,y0+size)
im.crop((x0,y0,x1,y1)).save("${crop}")
px=im.load()
def L(x,y):
  r,g,b=px[x,y]; return 0.2126*r+0.7152*g+0.0722*b
ring=far=core=0; nr=nf=nc=0
for y in range(max(0,cy-200), min(h,cy+200)):
  for x in range(max(0,cx-200), min(w,cx+200)):
    d=((x-cx)**2+(y-cy)**2)**0.5
    v=L(x,y)
    if d<22: core+=v; nc+=1
    elif 40<=d<100: ring+=v; nr+=1
    elif 130<=d<200: far+=v; nf+=1
print(json.dumps({
  "cx":cx,"cy":cy,"w":w,"h":h,
  "coreL": round(core/nc,1) if nc else 0,
  "ringL": round(ring/nr,1) if nr else 0,
  "farL": round(far/nf,1) if nf else 0,
  "vacuumRatio": round((ring/nr)/(far/nf),3) if nr and nf else None
}))
`;
  const metrics = JSON.parse(
    spawnSync("python3", ["-c", py], { encoding: "utf8" }).stdout.trim()
  );
  return { label, path, crop, tube, metrics };
}

const cases = [];
cases.push(
  await capture("shell-on", () => {
    /* default */
  })
);
cases.push(
  await capture("shell-off", () => {
    window.__stage.scene.traverse((o) => {
      if (o.name === "neon-tube-halo") {
        o.userData._vacVis = o.visible;
        o.visible = false;
      }
    });
  })
);
cases.push(
  await capture("shell-body-off", () => {
    window.__stage.scene.traverse((o) => {
      if (o.name === "neon-tube-halo" || o.name === "neon-tube-body") {
        o.userData._vacVis = o.visible;
        o.visible = false;
      }
    });
  })
);
cases.push(
  await capture("fog-off", () => {
    if (window.__stage.volumetricFog) {
      window.__stage.volumetricFog.enabled = false;
    }
  })
);
cases.push(
  await capture("shell-off-fog-off", () => {
    window.__stage.scene.traverse((o) => {
      if (o.name === "neon-tube-halo") {
        o.userData._vacVis = o.visible;
        o.visible = false;
      }
    });
    if (window.__stage.volumetricFog) {
      window.__stage.volumetricFog.enabled = false;
    }
  })
);

await restoreAll();

// Fog debug: does volumetric appear when forced?
const fogDiag = await page.evaluate(() => {
  const before = window.__stage.debugVolumetricFog?.() ?? null;
  window.__stage.debugFog?.("volumetric");
  const afterForce = window.__stage.debugVolumetricFog?.() ?? null;
  const fade = window.__stage._volFogFade;
  const enabled = window.__stage.volumetricFog?.enabled;
  const dens =
    window.__stage.volumetricFog?.marchMaterial?.uniforms?.uFogDensityMultiplier
      ?.value ??
    window.__stage.volumetricFog?.densityScale ??
    null;
  const densScale =
    typeof window.__stage.volumetricFog?.getDensityScale === "function"
      ? window.__stage.volumetricFog.getDensityScale()
      : window.__stage.volumetricFog?._densityScale ?? null;
  return { before, afterForce, fade, enabled, dens, densScale };
});

console.log(
  JSON.stringify(
    {
      shellState,
      cases: cases.map((c) => ({
        label: c.label,
        metrics: c.metrics,
        crop: c.crop
      })),
      fogDiag
    },
    null,
    2
  )
);
await browser.close();
