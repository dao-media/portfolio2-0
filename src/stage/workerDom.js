/**
 * Stand-in for `document` / `window` so Three's image and canvas helpers can
 * run on a worker. Installed only when those globals are missing. The page HUD
 * stays on the main thread.
 */
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
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Image failed: ${url}`);
          return response.blob();
        })
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
