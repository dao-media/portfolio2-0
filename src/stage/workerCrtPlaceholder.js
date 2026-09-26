import * as THREE from "three";
import { applyScreenMapSettings } from "../scene/vignettes/screenTextureMap.js";

function hitPacked(flat, x, y) {
  if (!flat) return null;
  for (let i = flat.length - 5; i >= 0; i -= 5) {
    const bx = flat[i + 1];
    const by = flat[i + 2];
    const bw = flat[i + 3];
    const bh = flat[i + 4];
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return flat[i];
  }
  return null;
}

/**
 * CRT texture target in the worker. Pixels arrive as ImageBitmaps from
 * MySpaceScreen on the main thread. Commands go back the other way.
 */
export class WorkerCrtPlaceholder {
  constructor() {
    this.canvas = new OffscreenCanvas(1024, 768);
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    applyScreenMapSettings(this.texture);
    this.powerOnProgress = 0;
    this.isPoweredOn = false;
    this.monitorLedOn = false;
    this.isMonitorBooting = false;
    this.hoverId = null;
    this._hoverIndex = null;
    this._xy = { x: 0, y: 0 };
    this.xpBoot = { canStartBoot: false, isBooting: false };
    /** @type {((command: string, payload?: object) => void) | null} */
    this.onCommand = null;
    this.drawOff();
  }

  getTexture() {
    return this.texture;
  }

  /**
   * @param {ImageBitmap} bitmap
   * @param {Record<string, unknown>} [state]
   */
  applyBitmap(bitmap, state = {}) {
    if (state && typeof state === "object") {
      if (typeof state.powerOnProgress === "number") this.powerOnProgress = state.powerOnProgress;
      if (typeof state.isPoweredOn === "boolean") this.isPoweredOn = state.isPoweredOn;
      if (typeof state.monitorLedOn === "boolean") this.monitorLedOn = state.monitorLedOn;
      if (typeof state.isMonitorBooting === "boolean") this.isMonitorBooting = state.isMonitorBooting;
      if ("hoverId" in state) this.hoverId = state.hoverId ?? null;
      if (typeof state.canStartBoot === "boolean") this.xpBoot.canStartBoot = state.canStartBoot;
      if (typeof state.isBooting === "boolean") this.xpBoot.isBooting = state.isBooting;
    }
    const prev = this.texture.image;
    this.texture.image = bitmap;
    this.texture.needsUpdate = true;
    if (
      prev &&
      prev !== bitmap &&
      typeof ImageBitmap !== "undefined" &&
      prev instanceof ImageBitmap
    ) {
      prev.close();
    }
  }

  drawOff() {}

  draw() {}

  setHoverIndex(index) {
    this._hoverIndex = index || null;
  }

  /**
   * Canvas pixel from a mesh UV, written into this._xy. Same math as
   * screenUvToCanvas, without a new object per pointer move.
   */
  _uvToCanvas(uv, index) {
    let u = uv.x;
    let v = uv.y;
    if (index.hasBounds) {
      const uSpan = index.uMax - index.uMin || 1;
      const vSpan = index.vMax - index.vMin || 1;
      u = (uv.x - index.uMin) / uSpan;
      v = (uv.y - index.vMin) / vSpan;
    }
    const sampleU = index.offsetX + index.repeatX * u;
    const sampleV = index.offsetY + index.repeatY * v;
    this._xy.x = sampleU * index.w;
    this._xy.y = index.flipY === false ? sampleV * index.h : (1 - sampleV) * index.h;
  }

  _hoverIdAt(uv) {
    const index = this._hoverIndex;
    if (!index || !uv) return null;
    this._uvToCanvas(uv, index);
    const { x, y } = this._xy;
    if (index.boot) return hitPacked(index.chrome, x, y) ?? hitPacked(index.page, x, y);
    const chromeId = hitPacked(index.chrome, x, y);
    if (chromeId) return chromeId;
    if (x < index.cx || x > index.cx + index.cw || y < index.cy || y > index.cy + index.ch) {
      return null;
    }
    return hitPacked(index.page, x - index.cx, y - index.cy + index.scrollY);
  }

  setHover(uv) {
    const id = uv ? this._hoverIdAt(uv) : null;
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.onCommand?.("setHover", {
      uv: uv ? { x: uv.x, y: uv.y } : null,
      id
    });
  }

  setScreenMap(map) {
    if (!map) return;
    applyScreenMapSettings(this.texture, map);
  }

  setScreenUvBounds() {}

  setWarpSourceMesh() {}

  setCaptureSize() {}

  setMonitorPowerLedHandler() {}

  playPowerOn() {
    this.onCommand?.("playPowerOn");
    return Promise.resolve();
  }

  backToDashboard() {
    this.onCommand?.("backToDashboard");
  }

  handlePointer(uv) {
    this.onCommand?.("pointer", { uv: uv ? { x: uv.x, y: uv.y } : null });
    return false;
  }

  handleWheel(deltaY) {
    this.onCommand?.("wheel", { deltaY });
    return false;
  }
}
