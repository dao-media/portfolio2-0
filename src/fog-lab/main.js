/**
 * Standalone volumetric-fog lab. No StageExperience / NeonSystem / live fog path.
 * Tier B: shared VolumetricFogPass + fogConfig (same as stage).
 *
 * PARITY: lab sliders start from createFogParams() === FOG_DEFAULTS. Do not
 * hardcode alternate ray/step/density here — “looks good in lab” must equal
 * stage. Persist nothing; refresh reloads schema defaults.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer, RenderPass } from "postprocessing";
import {
  CAM_FOV,
  CAM_Y,
  CAM_Z,
  LOOK,
  NEON_LIGHT_DECAY,
  NEON_LIGHT_DISTANCE,
  NEON_LIGHT_HEIGHT,
  NEON_MAX_LIGHT,
  STAGE_BG,
  STAGE_RADIUS
} from "../scene/stage/constants.js";
import { VolumetricFogPass } from "../scene/neon/VolumetricFogPass.js";
import { createFogParams, FOG_DEFAULTS, FOG_PARAM_SCHEMA } from "../fog/fogConfig.js";

/** Lab fog params — identical to stage live defaults (mutable copy for sliders). */
const fogParams = createFogParams();
if (fogParams.baseMaxRayLength !== FOG_DEFAULTS.baseMaxRayLength) {
  throw new Error("fog-lab parity: baseMaxRayLength diverged from FOG_DEFAULTS");
}

/** Friendlier slider labels for travel / wind (keys stay fogConfig names). */
const LAB_LABELS = {
  noiseSpeed: "travel speed",
  noiseMovementX: "wind X",
  noiseMovementY: "wind Z",
  noiseYScroll: "Y scroll",
  halfRes: "halfRes"
};

/** Put travel controls near the top of the number list. */
const SLIDER_PRIORITY = ["noiseSpeed", "noiseMovementX", "noiseMovementY", "noiseYScroll"];

const PEER_REPORT = {
  package: "Ameobea/three-volumetric-pass (GitHub only — not on npm registry)",
  peers: { three: ">=0.151 <=0.159", postprocessing: "^6.33.4" },
  ours: { three: "^0.172.0", postprocessing: "^6.39.4" },
  verdict: "CONFLICT on three peer (0.172 outside <=0.159). Using Tier B hand-written pass."
};

const canvas = document.getElementById("fog-lab-canvas");
const statusEl = document.getElementById("fog-lab-status");
const fpsEl = document.getElementById("stat-fps");
const msEl = document.getElementById("stat-ms");
const halfEl = document.getElementById("stat-half");
const formEl = document.getElementById("fog-lab-sliders");

statusEl.textContent =
  "Tier B — screen-space raymarch (Bayer dither, half-res bilateral upsample, neon in-scatter ×2)";
halfEl.textContent = fogParams.halfRes ? "on" : "off";

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setClearColor(STAGE_BG, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(STAGE_BG);

const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 120);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.copy(LOOK);

scene.add(new THREE.AmbientLight(0xffffff, 0.06));
scene.add(new THREE.HemisphereLight(0x8899aa, 0x070709, 0.04));

/** Two stand-in neon PointLights at ring stops 0 and 1. */
function placeNeonStandIn(index, hex, name) {
  const angle = (index / 4) * Math.PI * 2;
  const x = Math.sin(angle) * STAGE_RADIUS;
  const z = Math.cos(angle) * STAGE_RADIUS;
  const light = new THREE.PointLight(hex, NEON_MAX_LIGHT * 0.85, NEON_LIGHT_DISTANCE * 1.35, NEON_LIGHT_DECAY);
  light.position.set(x, NEON_LIGHT_HEIGHT, z);
  light.name = name;
  light.castShadow = false;
  scene.add(light);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: hex })
  );
  marker.position.copy(light.position);
  scene.add(marker);

  return light;
}

const lightA = placeNeonStandIn(0, 0x00e5ff, "lab-neon-0");
const lightB = placeNeonStandIn(1, 0xff2d95, "lab-neon-1");

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(STAGE_RADIUS * (70 / 9), 64),
  new THREE.MeshStandardMaterial({
    color: STAGE_BG,
    roughness: 0.94,
    metalness: 0.0
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/** Stand-in props — fog must stop on their depth (no fog-through). */
const propMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  roughness: 0.7,
  metalness: 0.05
});
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2;
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), propMat);
  box.position.set(Math.sin(angle) * STAGE_RADIUS, 0.8, Math.cos(angle) * STAGE_RADIUS);
  box.rotation.y = angle;
  scene.add(box);
}

const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType,
  multisampling: 0
});
composer.addPass(new RenderPass(scene, camera));

const fogPass = new VolumetricFogPass(camera, {
  halfRes: fogParams.halfRes,
  useComposerDepth: true,
  depthPacked: false,
  params: fogParams
});
composer.addPass(fogPass);

function applyPreset(name) {
  controls.enableDamping = false;
  if (name === "grazing") {
    camera.position.set(0, CAM_Y, CAM_Z);
    controls.target.copy(LOOK);
  } else if (name === "overhead") {
    camera.position.set(0, 28, 0.01);
    controls.target.set(0, 0, 0);
  } else if (name === "ring") {
    camera.position.set(0, 1.2, STAGE_RADIUS + 6);
    controls.target.set(0, 0.6, STAGE_RADIUS);
  }
  camera.updateProjectionMatrix();
  controls.update();
  controls.enableDamping = true;
}

applyPreset("grazing");

document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset")));
});

const sliderDefs = FOG_PARAM_SCHEMA.filter((s) => s.type === "number")
  .map((s) => ({
    key: s.key,
    min: s.min,
    max: s.max,
    step: s.step
  }))
  .sort((a, b) => {
    const ia = SLIDER_PRIORITY.indexOf(a.key);
    const ib = SLIDER_PRIORITY.indexOf(b.key);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

function formatVal(key, v) {
  if (key === "baseRaymarchStepCount" || key === "baseMaxRayLength") return String(Math.round(v));
  if (Math.abs(v) < 0.01 || Math.abs(v) >= 10) return v.toFixed(3);
  return v.toFixed(2);
}

function onParamChange() {
  halfEl.textContent = fogParams.halfRes ? "on" : "off";
  fogPass.setParams(fogParams);
  window.dispatchEvent(new CustomEvent("fog-lab:params", { detail: { ...fogParams } }));
}

{
  const row = document.createElement("div");
  row.className = "fog-lab__row fog-lab__row--check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = "param-halfRes";
  input.checked = fogParams.halfRes;
  const label = document.createElement("label");
  label.htmlFor = input.id;
  label.textContent = LAB_LABELS.halfRes;
  input.addEventListener("change", () => {
    fogParams.halfRes = input.checked;
    onParamChange();
  });
  row.append(input, label);
  formEl.append(row);
}

for (const def of sliderDefs) {
  const row = document.createElement("div");
  row.className = "fog-lab__row";
  const label = document.createElement("label");
  label.htmlFor = `param-${def.key}`;
  label.textContent = LAB_LABELS[def.key] ?? def.key;
  const input = document.createElement("input");
  input.type = "range";
  input.id = `param-${def.key}`;
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String(def.step);
  input.value = String(fogParams[def.key]);
  const out = document.createElement("output");
  out.htmlFor = input.id;
  out.textContent = formatVal(def.key, fogParams[def.key]);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    fogParams[def.key] = v;
    out.textContent = formatVal(def.key, v);
    onParamChange();
  });
  row.append(label, input, out);
  formEl.append(row);
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
}

window.addEventListener("resize", resize);
resize();

const lastStats = { fps: 0, ms: 0, frames: 0 };
let frames = 0;
let fpsAccum = 0;
let lastFpsT = performance.now();
const clock = new THREE.Clock();

/**
 * Settle, then average the live HUD `composer.render()` ms samples.
 * Direct performance.now around a single render() is noisy under GPU async.
 * @param {number} [settleMs]
 * @param {number} [sampleMs]
 */
async function measureCost(settleMs = 700, sampleMs = 1000) {
  await new Promise((r) => setTimeout(r, settleMs));
  const samples = [];
  const t0 = performance.now();
  while (performance.now() - t0 < sampleMs) {
    await new Promise((r) => setTimeout(r, 200));
    samples.push(lastStats.ms);
  }
  const ms = samples.reduce((a, b) => a + b, 0) / Math.max(samples.length, 1);
  return {
    ms,
    fps: lastStats.fps,
    samples: samples.length,
    steps: fogParams.baseRaymarchStepCount,
    halfRes: fogParams.halfRes
  };
}

/**
 * Sweep step counts at current preset. Returns [{steps, ms, fps}, ...].
 * @param {number[]} [stepsList]
 */
async function measureStepCurve(stepsList = [8, 12, 16, 20, 24, 32, 48]) {
  const out = [];
  const prev = fogParams.baseRaymarchStepCount;
  for (const steps of stepsList) {
    fogParams.baseRaymarchStepCount = steps;
    fogPass.setParams(fogParams);
    const slider = document.getElementById("param-baseRaymarchStepCount");
    if (slider) {
      slider.value = String(steps);
      const outEl = slider.parentElement?.querySelector("output");
      if (outEl) outEl.textContent = String(steps);
    }
    out.push(await measureCost(500, 800));
  }
  fogParams.baseRaymarchStepCount = prev;
  fogPass.setParams(fogParams);
  const slider = document.getElementById("param-baseRaymarchStepCount");
  if (slider) {
    slider.value = String(prev);
    const outEl = slider.parentElement?.querySelector("output");
    if (outEl) outEl.textContent = String(prev);
  }
  return out;
}

window.__fogLab = {
  fogParams,
  peerReport: PEER_REPORT,
  fogPass,
  getStats: () => ({ ...lastStats }),
  applyPreset,
  measureCost,
  measureStepCurve,
  setSteps(n) {
    fogParams.baseRaymarchStepCount = n;
    onParamChange();
    const slider = document.getElementById("param-baseRaymarchStepCount");
    if (slider) {
      slider.value = String(n);
      const outEl = slider.parentElement?.querySelector("output");
      if (outEl) outEl.textContent = String(n);
    }
  }
};

function animate(now) {
  requestAnimationFrame(animate);
  const t0 = performance.now();
  controls.update();
  // Steady intensities for look proofs (no pulse during capture).
  lightA.intensity = NEON_MAX_LIGHT * 0.85;
  lightB.intensity = NEON_MAX_LIGHT * 0.85;
  fogPass.setLights([lightA, lightB]);
  fogPass.setTime(clock.getElapsedTime());
  composer.render();
  const ms = performance.now() - t0;
  frames += 1;
  fpsAccum += ms;
  if (now - lastFpsT >= 500) {
    const fps = (frames * 1000) / (now - lastFpsT);
    const avgMs = fpsAccum / frames;
    lastStats.fps = fps;
    lastStats.ms = avgMs;
    lastStats.frames = frames;
    fpsEl.textContent = fps.toFixed(0);
    msEl.textContent = avgMs.toFixed(2);
    frames = 0;
    fpsAccum = 0;
    lastFpsT = now;
  }
}

console.info("[fog-lab] Tier B LabVolumetricFogPass", PEER_REPORT);
requestAnimationFrame(animate);
