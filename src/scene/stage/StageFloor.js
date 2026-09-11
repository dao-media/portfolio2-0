import * as THREE from "three";
import { STAGE_BG, STAGE_FLOOR_RADIUS, STAGE_RADIUS } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/** Outer apron matches studio shell footprint. */
const APRON_SIZE = STAGE_FLOOR_RADIUS * 2.15;
/**
 * Lit turntable — covers vignettes only. Beyond this, MeshBasic apron matches
 * the shell so the grazing horizon is apron|wall (no lit/unlit knife).
 */
const LIT_SIZE = STAGE_RADIUS * 2.4; // ~43 m
/** Radial soft falloff (m) from lit center — kills hard lit→apron ring in frame. */
const LIT_FADE_START = LIT_SIZE * 0.28;
const LIT_FADE_END = LIT_SIZE * 0.48;

/**
 * Turntable floor group:
 * - `stage-floor-lit` — MeshStandard STAGE_BG with radial fade to apron
 * - `stage-floor-apron` — MeshBasic STAGE_BG to the shell walls
 *
 * @returns {THREE.Group}
 */
export function buildStageFloor() {
  const group = new THREE.Group();
  group.name = "stage-floor";
  group.position.set(0, STAGE_FLOOR_Y + 0.004, STAGE_RADIUS);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(APRON_SIZE, APRON_SIZE),
    new THREE.MeshBasicMaterial({ color: STAGE_BG })
  );
  apron.name = "stage-floor-apron";
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.002;
  apron.receiveShadow = false;

  const litMat = new THREE.MeshStandardMaterial({
    color: STAGE_BG,
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0
  });
  litMat.onBeforeCompile = (shader) => {
    shader.uniforms.uLitFadeStart = { value: LIT_FADE_START };
    shader.uniforms.uLitFadeEnd = { value: LIT_FADE_END };
    shader.uniforms.uApronColor = {
      value: new THREE.Color(STAGE_BG)
    };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec2 vFloorLocal;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vFloorLocal = position.xy;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
varying vec2 vFloorLocal;
uniform float uLitFadeStart;
uniform float uLitFadeEnd;
uniform vec3 uApronColor;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `float floorR = length(vFloorLocal);
float floorFade = 1.0 - smoothstep(uLitFadeStart, uLitFadeEnd, floorR);
gl_FragColor.rgb = mix(uApronColor, gl_FragColor.rgb, floorFade);
#include <dithering_fragment>`
    );
  };
  litMat.customProgramCacheKey = () => "stage-floor-lit-radial-fade-v1";

  const lit = new THREE.Mesh(new THREE.PlaneGeometry(LIT_SIZE, LIT_SIZE), litMat);
  lit.name = "stage-floor-lit";
  lit.rotation.x = -Math.PI / 2;
  lit.position.y = 0;
  lit.receiveShadow = true;

  group.add(apron);
  group.add(lit);

  return group;
}
