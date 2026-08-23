/**
 * Page-load boot overlay — reuses the XP progress bar chrome on the fader
 * so a fast load cannot cut the open beat short.
 */
export class StageBootSequence {
  /**
   * @param {{ fader?: HTMLElement | null, hud?: { setProgress?: (n: number) => void } | null }} opts
   */
  constructor({ fader, hud } = {}) {
    this.fader = fader ?? null;
    this.hud = hud ?? null;
    this.fader?.classList.add("is-gating");
  }

  /** @param {number} progress 0..1 */
  setProgress(progress) {
    const p = Math.max(0, Math.min(1, progress));
    this.hud?.setProgress?.(p);
    if (this.fader) {
      this.fader.style.setProperty("--boot-progress", String(p));
    }
  }

  dismiss() {
    this.fader?.classList.add("gone");
    this.fader?.classList.remove("is-gating");
  }
}
