import { MySpaceScreen } from "./MySpaceScreen.js";
import { MySpacePanel } from "./MySpacePanel.js";

export class HUDController {
  constructor() {
    this.titleEl = document.getElementById("vignette-title");
    this.subtitleEl = document.getElementById("vignette-subtitle");
    this.progressEl = document.getElementById("scroll-progress");

    this.mySpaceScreen = new MySpaceScreen();
    this.mySpacePanel = new MySpacePanel();

    this.mySpaceScreen.setChangeHandler((item) => {
      this.mySpacePanel.syncFromScreen(item);
    });
    this.mySpaceScreen.setPoweredOnHandler(() => {
      this.updateMySpacePanelForVignette(this._vignetteIndex);
    });
    this._vignetteIndex = 0;

    this.mySpacePanel.setHandlers({
      onNavigate: (id) => {
        if (id === null) this.mySpaceScreen.backToDashboard();
        else this.mySpaceScreen.openItem(id);
      },
      onClose: () => this.hideMySpacePanel()
    });
  }

  /** Dots + caption for the worker host. Stops arrive once from the worker. */
  setStops(stops, onSelect) {
    this._stops = stops;
    const dots = document.getElementById("dots");
    if (!dots) return;
    dots.replaceChildren();
    stops.forEach((stop, index) => {
      const button = document.createElement("button");
      button.className = `dot${index === 0 ? " active" : ""}`;
      button.setAttribute("aria-label", stop.name);
      button.addEventListener("click", () => onSelect(index));
      dots.appendChild(button);
    });
  }

  /**
   * @param {{ stopIndex: number, count: number, name: string, desc: string }} data
   */
  updateCaption(data) {
    const index = data.stopIndex ?? 0;
    const count = data.count ?? this._stops?.length ?? 0;
    const capIndex = document.getElementById("capIndex");
    const capName = document.getElementById("capName");
    const capDesc = document.getElementById("capDesc");
    const dots = document.getElementById("dots");
    if (capIndex) {
      capIndex.textContent = `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;
    }
    if (capName) capName.textContent = data.name ?? "";
    if (capDesc) capDesc.textContent = data.desc ?? "";
    if (dots) {
      [...dots.children].forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
      });
    }
    this._vignetteIndex = index;
    this.updateMySpacePanelForVignette(index);
  }

  setReadout(text) {
    const readout = document.getElementById("readout");
    if (readout) readout.textContent = text;
  }

  setFps(fps) {
    const el = document.getElementById("fps");
    if (el) el.textContent = `${fps} FPS`;
  }

  setVignette(meta) {
    if (this.titleEl) this.titleEl.textContent = meta.title;
    if (this.subtitleEl) this.subtitleEl.textContent = meta.subtitle;
  }

  setProgress(progress) {
    if (this.progressEl) {
      this.progressEl.style.width = `${Math.round(progress * 100)}%`;
    }
  }

  getMySpaceScreen() {
    return this.mySpaceScreen;
  }

  showMySpacePanel() {
    this.mySpacePanel.mirrorScreen(this.mySpaceScreen);
    this.mySpacePanel.show();
  }

  hideMySpacePanel() {
    this.mySpacePanel.hide();
  }

  /** Show fullscreen profile on mobile when the desktop vignette is active. */
  updateMySpacePanelForVignette(index) {
    this._vignetteIndex = index;
    const isDesktop = index === 1;
    const isMobileLayout = window.matchMedia("(max-width: 900px)").matches;
    const poweredOn = this.mySpaceScreen.isPoweredOn;

    if (isDesktop && isMobileLayout && poweredOn) {
      this.showMySpacePanel();
      return;
    }

    this.hideMySpacePanel();
  }
}
