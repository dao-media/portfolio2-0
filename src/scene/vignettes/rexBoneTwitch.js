import gsap from "gsap";
import * as THREE from "three";
import { ownMeshMaterial } from "./gltfMaterialOwnership.js";

const HEAD_NAME = "Barebone_dino_head_pivot";
const TOOTH_NAME = "Barebone_dino_tooth_pivot";
const TAIL_NAME = "Barebone_dino_tail_pivot";

/**
 * Digit / claw meshes — this fossil has no separate arm bones, so the
 * phalanges (authored as "toe") are the clawed bits that can flick.
 */
const CLAW_NAMES = [
  "Barebone_dino_toe001_pivot",
  "Barebone_dino_toe002_pivot",
  "Barebone_dino_toe003_pivot",
  "Barebone_dino_toe004_pivot",
  "Barebone_dino_toe005_pivot",
  "Barebone_dino_toe006_pivot",
  "Barebone_dino_toe007_pivot",
  "Barebone_dino_toe008_pivot",
  "Barebone_dino_toe011_pivot",
  "Barebone_dino_toe012_pivot",
  "Barebone_dino_toe013_pivot",
  "Barebone_dino_toe014_pivot"
];

/** Hind-limb bones + larger foot pieces. */
const LEG_NAMES = [
  "Barebone_dino_hip_L_pivot",
  "Barebone_dino_hip_R_pivot",
  "Barebone_dino_leg_L_pivot",
  "Barebone_dino_shin_L_pivot",
  "Barebone_dino_shin_R_pivot",
  "Barebone_dino_toe_pivot",
  "Barebone_dino_toe09_pivot",
  "Barebone_dino_toe010_pivot",
  "Barebone_dino_toe009_pivot"
];

const AXIS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

/** Each trigger covers this fraction of the remaining start→finish span. */
const TWITCH_SPAN_FRAC = 0.6;
const TAIL_SHADER_KEY = "rex-tail-serpentine-v3";
const _WORLD_UP = new THREE.Vector3(0, 1, 0);
const _LOCAL_UP = new THREE.Vector3();
const _INV_WORLD = new THREE.Matrix4();

/**
 * Occasional fossil twitches — a bone flicks as if something is still in there.
 * Head, claws, and legs fire on the regular cadence; the tail only moves on
 * its own rarer twitch, as a traveling S-curve that then holds.
 */
export class RexBoneTwitch {
  /**
   * @param {THREE.Object3D} root
   * @param {{ reducedMotion?: boolean }} [opts]
   */
  constructor(root, opts = {}) {
    this.reducedMotion = Boolean(opts.reducedMotion);
    this._tweens = [];
    this._nextAt = 1.6 + Math.random() * 3.2;
    this._nextTailAt = 7.5 + Math.random() * 6;
    this._scratchQuat = new THREE.Quaternion();
    this._tailWave = null;
    this._tailTweens = [];
    this._tailHoldMax = 0;
    this._tailWavePeak = 0;
    this._tailHoldT = 0.5;

    this._anchorToothToSkull(root);

    this._head = this._collect(root, [HEAD_NAME]);
    this._claws = this._collect(root, CLAW_NAMES);
    this._legs = this._collect(root, LEG_NAMES);
    this._regularGroups = [this._head, this._claws, this._legs].filter((g) => g.length);

    if (!this.reducedMotion) {
      this._installTailWave(root);
    }
  }

  /**
   * @param {number} time Scene elapsed seconds
   */
  update(time) {
    if (this.reducedMotion) return;
    if (time >= this._nextAt && this._regularGroups.length) {
      this._nextAt = time + 2.4 + Math.random() * 4.2;
      this._playLimbBurst();
    }
    if (time >= this._nextTailAt && this._tailWave) {
      this._nextTailAt = time + 8.5 + Math.random() * 8;
      this._playTailBurst();
    }
  }

  dispose() {
    this._tweens.forEach((tween) => tween.kill());
    this._tweens.length = 0;
    [...this._head, ...this._claws, ...this._legs].forEach((bone) => {
      bone.tween?.kill();
      bone.t = 0.5;
      bone.node.quaternion.copy(bone.rest);
    });
    if (this._tailWave) {
      this._tailWave.uWave.value = 0;
      this._tailWave.uHold.value = 0;
    }
  }

  _anchorToothToSkull(root) {
    const head = root.getObjectByName(HEAD_NAME);
    const tooth = root.getObjectByName(TOOTH_NAME);
    if (!head || !tooth || tooth.parent === head) return;
    head.attach(tooth);
  }

  _collect(root, names) {
    const bones = [];
    names.forEach((name) => {
      const node = root.getObjectByName(name);
      if (!node) return;
      const axisKeys = Object.keys(AXIS);
      bones.push({
        node,
        rest: node.quaternion.clone(),
        axis: AXIS[axisKeys[Math.floor(Math.random() * axisKeys.length)]],
        span: 0.14 + Math.random() * 0.08,
        t: 0.5,
        tween: null
      });
    });
    return bones;
  }

  _installTailWave(root) {
    const node = root.getObjectByName(TAIL_NAME);
    const mesh = node?.isMesh ? node : node?.children?.find((child) => child.isMesh);
    if (!mesh?.isMesh || !mesh.geometry?.attributes?.position) return;

    const basis = this._tailBasis(mesh);
    if (!basis) return;

    this._tailHoldMax = basis.length * 0.05;
    this._tailWavePeak = basis.length * 0.07;
    this._tailHoldT = 0.5;
    const uniforms = {
      uHold: { value: 0 },
      uWave: { value: 0 },
      uPhase: { value: 0 },
      uAxis: { value: basis.axis },
      uSide: { value: basis.side },
      uUp: { value: basis.up },
      uLength: { value: basis.length }
    };
    this._tailWave = uniforms;

    const materials = ownMeshMaterial(mesh);
    const list = Array.isArray(materials) ? materials : [materials];
    list.forEach((mat) => {
      if (!mat) return;
      this._bindTailShader(mat, uniforms);
    });

    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    });
    this._bindTailShader(depthMat, uniforms);
    mesh.customDepthMaterial = depthMat;
  }

  _tailBasis(mesh) {
    const pos = mesh.geometry.attributes.position;
    const centroid = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      centroid.x += pos.getX(i);
      centroid.y += pos.getY(i);
      centroid.z += pos.getZ(i);
    }
    if (pos.count < 2) return null;
    centroid.divideScalar(pos.count);
    if (centroid.lengthSq() < 1e-8) return null;

    const axis = centroid.clone().normalize();
    let length = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const along = axis.x * pos.getX(i) + axis.y * pos.getY(i) + axis.z * pos.getZ(i);
      if (along > length) length = along;
    }
    if (length < 1e-4) return null;

    mesh.updateMatrixWorld(true);
    _INV_WORLD.copy(mesh.matrixWorld).invert();
    _LOCAL_UP.copy(_WORLD_UP).transformDirection(_INV_WORLD);
    if (_LOCAL_UP.lengthSq() < 1e-8) _LOCAL_UP.set(0, 1, 0);
    _LOCAL_UP.normalize();

    const side = new THREE.Vector3().crossVectors(_LOCAL_UP, axis);
    if (side.lengthSq() < 1e-8) {
      side.crossVectors(new THREE.Vector3(1, 0, 0), axis);
    }
    if (side.lengthSq() < 1e-8) return null;
    side.normalize();
    const up = new THREE.Vector3().crossVectors(axis, side).normalize();
    return { axis, side, up, length };
  }

  _bindTailShader(material, uniforms) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHold = uniforms.uHold;
      shader.uniforms.uWave = uniforms.uWave;
      shader.uniforms.uPhase = uniforms.uPhase;
      shader.uniforms.uAxis = uniforms.uAxis;
      shader.uniforms.uSide = uniforms.uSide;
      shader.uniforms.uUp = uniforms.uUp;
      shader.uniforms.uLength = uniforms.uLength;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          /* glsl */ `#include <common>
uniform float uHold;
uniform float uWave;
uniform float uPhase;
uniform vec3 uAxis;
uniform vec3 uSide;
uniform vec3 uUp;
uniform float uLength;`
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `#include <begin_vertex>
{
  float along = max(dot(transformed, uAxis), 0.0);
  float t = clamp(along / max(uLength, 0.0001), 0.0, 1.0);
  float env = t * t;
  float spatial = along * 6.2831853 / (uLength * 0.92);
  float hold = sin(spatial + 0.35) * uHold;
  float wave = sin(spatial - uPhase) * uWave;
  float lift = sin(spatial * 0.48 - uPhase * 0.35 + 1.15) * uWave * 0.22;
  transformed += uSide * (hold + wave) * env;
  transformed += uUp * (hold * 0.18 + lift) * env;
}`
        );
    };
    material.customProgramCacheKey = () => TAIL_SHADER_KEY;
  }

  _playLimbBurst() {
    const group = this._regularGroups[Math.floor(Math.random() * this._regularGroups.length)];
    const count = group === this._claws ? 2 + Math.floor(Math.random() * 2) : 1;
    const picks = this._pickMany(group, count);
    picks.forEach((bone, i) => {
      const delay = gsap.delayedCall((i * (55 + Math.random() * 80)) / 1000, () => {
        this._twitchBone(bone);
      });
      this._tweens.push(delay);
    });
  }

  _playTailBurst() {
    this._tailTweens.forEach((tween) => tween.kill());
    this._tailTweens.length = 0;

    this._tailHoldT = this._nextSpectrumT(this._tailHoldT);
    const hold = this._lerp(-this._tailHoldMax, this._tailHoldMax, this._tailHoldT);
    const travel = 0.82 + Math.random() * 0.28;
    this._tailWave.uPhase.value = 0;
    this._tailWave.uWave.value = 0;

    const holdTween = gsap.to(this._tailWave.uHold, {
      value: hold,
      duration: travel + 0.12,
      ease: "sine.inOut"
    });
    const phaseTween = gsap.to(this._tailWave.uPhase, {
      value: Math.PI * (1.85 + Math.random() * 0.5),
      duration: travel,
      ease: "none"
    });
    const waveTween = gsap.to(this._tailWave.uWave, {
      value: this._tailWavePeak,
      duration: travel * 0.32,
      ease: "sine.out",
      onComplete: () => {
        const settle = gsap.to(this._tailWave.uWave, {
          value: 0,
          duration: travel * 0.68,
          ease: "sine.in"
        });
        this._tailTweens.push(settle);
        this._tweens.push(settle);
      }
    });
    this._tailTweens.push(holdTween, phaseTween, waveTween);
    this._tweens.push(holdTween, phaseTween, waveTween);
  }

  /**
   * Walk ~60% of the remaining distance toward one end of [0, 1]
   * so a twitch never completes the full start→finish trip.
   */
  _nextSpectrumT(current) {
    const roomUp = 1 - current;
    const roomDown = current;
    let end = 1;
    if (roomUp < 0.12) end = 0;
    else if (roomDown < 0.12) end = 1;
    else end = Math.random() < 0.5 ? 1 : 0;
    const frac = TWITCH_SPAN_FRAC + (Math.random() - 0.5) * 0.1;
    return THREE.MathUtils.clamp(current + (end - current) * frac, 0, 1);
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  _pickMany(pool, count) {
    const copy = pool.slice();
    const out = [];
    while (out.length < count && copy.length) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  }

  _twitchBone(bone) {
    const fromT = bone.t;
    const toT = this._nextSpectrumT(fromT);
    bone.tween?.kill();
    const tween = { t: fromT };
    bone.tween = gsap.to(tween, {
      t: toT,
      duration: 0.38 + Math.random() * 0.28,
      ease: "sine.inOut",
      onUpdate: () => {
        bone.t = tween.t;
        this._applyBoneT(bone);
      },
      onComplete: () => {
        bone.t = toT;
        this._applyBoneT(bone);
        bone.tween = null;
      }
    });
    this._tweens.push(bone.tween);
  }

  _applyBoneT(bone) {
    this._scratchQuat.setFromAxisAngle(bone.axis, (bone.t - 0.5) * bone.span);
    bone.node.quaternion.copy(bone.rest).multiply(this._scratchQuat);
  }
}
