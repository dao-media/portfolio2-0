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
