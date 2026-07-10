import {
  isSiteAudioMuted,
  isSiteAudioActive,
  toggleSiteAudioMuted
} from "../audio/siteAudio.js";

const ICON_ON = `<svg class="audio-fab__icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none" aria-hidden="true">
  <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03zM14 4.45v2.18c2.89.86 5 3.54 5 6.37s-2.11 5.51-5 6.37v2.18c4.01-.91 7-4.49 7-8.55s-2.99-7.64-7-8.55z"/>
</svg>`;

const ICON_OFF = `<svg class="audio-fab__icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none" aria-hidden="true">
  <path d="M3.63 3.63a.996.996 0 0 0 0 1.41L7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18c-.49.37-1.02.68-1.6.91v2.07a8.001 8.001 0 0 0 2.31-1.11l2.04 2.04a.996.996 0 1 0 1.41-1.41L5.05 3.63a.996.996 0 0 0-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53A8.014 8.014 0 0 0 21 12c0-4.08-3.05-7.44-7-7.93v2.02c2.48.48 4.35 2.49 4.35 4.91zm-4-8.93V4.59A8.014 8.014 0 0 0 3 12c0 1.77.57 3.41 1.53 4.73l1.46-1.46A5.994 5.994 0 0 1 7 12a5.99 5.99 0 0 1 5-5.93z"/>
</svg>`;

export class AudioToggleFab {
  /** @param {string} [mountId] */
  constructor(mountId = "audio-toggle-root") {
    this.root = document.getElementById(mountId);
    if (!this.root) return;

    this.btn = document.createElement("button");
    this.btn.type = "button";
    this.btn.className = "audio-fab";
    this.btn.innerHTML = ICON_ON;
    this.root.appendChild(this.btn);

    this.btn.addEventListener("click", () => {
      toggleSiteAudioMuted();
      this._sync();
    });

    window.addEventListener("siteaudiomutechange", () => this._sync());
    window.addEventListener("siteaudioactivity", (event) => {
      this._setPlaying(Boolean(event.detail?.active));
    });
    this._sync();
    this._setPlaying(isSiteAudioActive());
  }

  /** @param {boolean} playing */
  _setPlaying(playing) {
    if (!this.btn) return;
    this.btn.classList.toggle("is-playing", playing && !isSiteAudioMuted());
  }

  _sync() {
    if (!this.btn) return;
    const muted = isSiteAudioMuted();
    this.btn.classList.toggle("is-muted", muted);
    this.btn.innerHTML = muted ? ICON_OFF : ICON_ON;
    this.btn.setAttribute("aria-pressed", String(muted));
    this.btn.setAttribute("aria-label", muted ? "Unmute site audio" : "Mute site audio");
    if (muted) this.btn.classList.remove("is-playing");
    else this._setPlaying(isSiteAudioActive());
  }
}
