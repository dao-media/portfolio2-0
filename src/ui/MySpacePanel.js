import { findContentById } from "../content/myspace-content.js";
import { MySpacePageView } from "./myspace/MySpacePageView.js";

/**
 * Full-viewport MySpace profile on mobile — same DOM layout as the CRT capture.
 */
export class MySpacePanel {
  constructor() {
    this.root = document.getElementById("myspace-panel");
    this.bodyEl = document.getElementById("myspace-panel-body");
    this.closeBtn = document.getElementById("myspace-close");

    this.pageView = new MySpacePageView({
      mode: "live",
      onNavigate: (id) => {
        if (id === null) this.onNavigate?.(null);
        else this.onNavigate?.(id);
      }
    });

    if (this.bodyEl) {
      this.pageView.mount(this.bodyEl);
    }

    this.closeBtn?.addEventListener("click", () => {
      this.onClose?.();
    });
  }

  setHandlers({ onNavigate, onClose }) {
    this.onNavigate = onNavigate;
    this.onClose = onClose;
  }

  show() {
    if (this.root) {
      this.root.hidden = false;
      this.root.classList.add("myspace-panel--fullscreen");
    }
  }

  hide() {
    if (this.root) {
      this.root.hidden = true;
      this.root.classList.remove("myspace-panel--fullscreen");
    }
  }

  syncFromScreen(itemOrId) {
    if (!itemOrId) {
      this.pageView.setView("dashboard");
      this.pageView.setScrollTop(0);
      return;
    }

    const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
    if (findContentById(id)) {
      this.pageView.setView("detail", id);
      this.pageView.setScrollTop(0);
    }
  }

  /** Mirror CRT navigation without firing onChange back to screen. */
  mirrorScreen(screen) {
    this.pageView.setView(screen.view, screen.selectedId);
    this.pageView.setScrollTop(screen.scrollY);
    this.pageView.setHover(screen.hoverId);
  }
}
