/**
 * Stand-in for `document` / `window` so Three's image and canvas helpers can
 * run on a worker. Installed only when those globals are missing. The page HUD
 * stays on the main thread.
 */
const IMAGE_FETCH_TIMEOUT_MS = 15000;

if (typeof document === "undefined") {
  globalThis.__STAGE_WORKER = true;

  class WorkerImage {
    constructor() {
      /** @type {Record<string, Function[]>} */
      this._listeners = {};
      this.crossOrigin = null;
      this.onload = null;
      this.onerror = null;
      this.width = 0;
      this.height = 0;
      /** @type {ImageBitmap | null} */
      this.bitmap = null;
    }

    addEventListener(type, fn) {
      const list = this._listeners[type] || [];
      list.push(fn);
      this._listeners[type] = list;
    }

    removeEventListener(type, fn) {
      const list = this._listeners[type];
      if (!list) return;
      this._listeners[type] = fn ? list.filter((item) => item !== fn) : [];
    }

    set src(url) {
      fetchImageBlob(url)
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          this.bitmap = bitmap;
          this.width = bitmap.width;
          this.height = bitmap.height;
          for (const fn of this._listeners.load || []) fn.call(bitmap);
          if (typeof this.onload === "function") this.onload.call(bitmap);
        })
        .catch((error) => {
          for (const fn of this._listeners.error || []) fn.call(this, error);
          if (typeof this.onerror === "function") this.onerror.call(this, error);
        });
    }
  }

  /**
   * Pass K — a stalled request must not hang its loader forever. Pass K's
   * harness caught one image fetch that never settled (no load, no error):
   * TextureLoader's promise, preloadPcTextures and the whole PC/Sidekick/
   * Archaeology integration waited on it, and those stops stayed empty for
   * the rest of the session. Abort after IMAGE_FETCH_TIMEOUT_MS, retry once,
   * then fail (callers already treat a failed texture as missing).
   * @param {string} url
   * @param {number} [attempt]
   * @returns {Promise<Blob>}
   */
  function fetchImageBlob(url, attempt = 0) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), IMAGE_FETCH_TIMEOUT_MS);
    return fetch(url, controller ? { signal: controller.signal } : undefined)
      .then((response) => {
        if (!response.ok) throw new Error(`Image failed: ${url}`);
        return response.blob();
      })
      .finally(() => clearTimeout(timer))
      .catch((error) => {
        if (error?.name === "AbortError" && attempt === 0) {
          console.warn(`[workerDom] image fetch stalled ${IMAGE_FETCH_TIMEOUT_MS} ms, retrying: ${url}`);
          return fetchImageBlob(url, 1);
        }
        throw error;
      });
  }

  function createCanvas() {
    const canvas = new OffscreenCanvas(1, 1);
    canvas.style = canvas.style || {};
    return canvas;
  }

  const classList = () => ({
    add() {},
    remove() {},
    toggle() {},
    contains() {
      return false;
    }
  });

  globalThis.document = {
    createElement(tag) {
      if (tag === "canvas") return createCanvas();
      if (tag === "img") return new WorkerImage();
      return {
        style: {},
        classList: classList(),
        appendChild() {},
        removeChild() {},
        setAttribute() {},
        getAttribute() {
          return null;
        },
        addEventListener() {},
        removeEventListener() {},
        querySelector() {
          return null;
        }
      };
    },
    createElementNS(_ns, tag) {
      return this.createElement(tag);
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    elementFromPoint() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    visibilityState: "visible",
    body: {
      classList: classList(),
      style: {},
      appendChild() {},
      removeChild() {}
    },
    documentElement: {
      clientWidth: 1,
      clientHeight: 1,
      style: {},
      classList: classList(),
      addEventListener() {},
      removeEventListener() {}
    },
    head: { appendChild() {} }
  };

  globalThis.Image = WorkerImage;
  globalThis.window = globalThis;

  if (typeof globalThis.matchMedia !== "function") {
    globalThis.matchMedia = (query) => ({
      matches: false,
      media: String(query),
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {}
    });
  }
}
