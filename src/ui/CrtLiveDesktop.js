import { MySpacePageView } from "./myspace/MySpacePageView.js";
import { quadToMatrix3d } from "./cssHomography.js";

const FADE_MS = 150;

/**
 * The Desktop CRT's MySpace page as a real, clickable DOM overlay — shown
 * only while the camera is zoomed into the monitor and MySpace has finished
 * booting. Positioned over the 3D content quad's actual screen-space
 * corners via a CSS `matrix3d` homography (see `cssHomography.js`), so
 * touch targets always match what the quad's own texture would have drawn
 * in that exact spot — no separate hit-region table to keep in sync.
 *
 * Reuses `mode: "crt"` (the same CSS the quad's own `html-to-image` capture
 * source uses) for an identical layout/typography to the canvas-texture
 * fallback, so the crossfade between the two is seamless. The IE browser
 * chrome (title bar / address bar / back-home-refresh) stays canvas-only —
 * this overlay only covers the inner content rect, so that chrome keeps
 * showing through (rendered on the 3D quad's texture) around it.
 */
export class CrtLiveDesktop {
  /** @param {import("./MySpaceScreen.js").MySpaceScreen} mySpaceScreen */
  constructor(mySpaceScreen) {
    this.mySpaceScreen = mySpaceScreen;
    this.root = document.getElementById("crt-live-root");
    this._live = false;
    this._sized = false;
    this._lastRect = null;

    if (!this.root) return;

    this.page = document.createElement("div");
    this.page.className = "crt-live__page";

    this.pageView = new MySpacePageView({
      mode: "crt",
      onNavigate: (id) => {
        if (id === null) this.mySpaceScreen.backToDashboard();
        else this.mySpaceScreen.openItem(id);
        // `mySpaceScreen`'s own state is now authoritative; mirror it back
        // so the live page shows the view it just navigated to.
        this.pageView.setView(this.mySpaceScreen.view, this.mySpaceScreen.selectedId);
        this.pageView.setScrollTop(0);
      }
    });
    this.pageView.mount(this.page);
    // "crt" mode renders full, unclipped height for html-to-image capture
    // (`overflow-y: visible`); a live overlay needs the opposite — a fixed
    // viewport window with real native scroll. Inline styles win over the
    // `.ms-root--crt .ms-viewport` class rule without touching it.
    this.pageView.viewport.style.height = "100%";
    this.pageView.viewport.style.maxHeight = "100%";
    this.pageView.viewport.style.overflowY = "auto";

    const glare = document.createElement("div");
    glare.className = "crt-live__glare";
    glare.setAttribute("aria-hidden", "true");

    this.page.appendChild(glare);
    this.root.appendChild(this.page);
  }

  /**
   * @param {{ corners: [number, number][], contentW: number, contentH: number } | null} rect
   */
  setScreenRect(rect) {
    if (!this.page) return;
    this._lastRect = rect;
    if (!rect) return;
    if (!this._sized) {
      this._sized = true;
      this.pageView.setCaptureWidth(rect.contentW);
      this.page.style.width = `${rect.contentW}px`;
      this.page.style.height = `${rect.contentH}px`;
    }
    this.page.style.transform = quadToMatrix3d(rect.contentW, rect.contentH, rect.corners);
  }

  /** @param {boolean} live */
  setLive(live) {
    if (!this.page || live === this._live) return;
    this._live = live;

    if (live) {
      this.pageView.setView(this.mySpaceScreen.view, this.mySpaceScreen.selectedId);
      this.pageView.setScrollTop(this.mySpaceScreen.scrollY || 0);
      if (this._lastRect) this.setScreenRect(this._lastRect);
      this.root.hidden = false;
      // Next frame, so the `hidden` removal and the opacity transition don't
      // collapse into one paint (no fade-in).
      requestAnimationFrame(() => {
        if (this._live) this.page.classList.add("is-shown");
      });
      return;
    }

    this.page.classList.remove("is-shown");
    // One resync, not a per-frame capture: content is already current (every
    // navigation already re-captures the canvas texture on its own); only
    // the live DOM's native scroll position needs folding back in.
    this.mySpaceScreen.syncScrollFromLive(this.pageView.scrollTop);
    const root = this.root;
    const onEnd = (event) => {
      if (event.target !== this.page) return;
      this.page.removeEventListener("transitionend", onEnd);
      if (!this._live) root.hidden = true;
    };
    this.page.addEventListener("transitionend", onEnd);
  }

  get isLive() {
    return this._live;
  }
}
