import { clamp01 } from "./math.js";

export class ScrollController {
  /**
   * @param {object} options
   * @param {HTMLElement} options.scrollRoot
   * @param {number} options.sectionCount
   */
  constructor({ scrollRoot, sectionCount }) {
    this.scrollRoot = scrollRoot;
    this.sectionCount = sectionCount;
    this.progress = 0;
    this.targetProgress = 0;
    this._wheelAccum = 0;
    this._touchStartY = 0;
    this._touchLastY = 0;
    this._boundOnWheel = this._onWheel.bind(this);
    this._boundOnTouchStart = this._onTouchStart.bind(this);
    this._boundOnTouchMove = this._onTouchMove.bind(this);
    this._boundOnTouchEnd = this._onTouchEnd.bind(this);

    this._buildScrollSurface();
    this.attach();
  }

  _buildScrollSurface() {
    this.scrollRoot.innerHTML = "";
    this.scrollRoot.style.height = `${this.sectionCount * 100}vh`;
    this.scrollRoot.style.pointerEvents = "auto";

    for (let i = 0; i < this.sectionCount; i += 1) {
      const section = document.createElement("section");
      section.className = "scroll-section";
      section.style.height = "100vh";
      this.scrollRoot.appendChild(section);
    }
  }

  attach() {
    window.addEventListener("wheel", this._boundOnWheel, { passive: false });
    window.addEventListener("touchstart", this._boundOnTouchStart, { passive: true });
    window.addEventListener("touchmove", this._boundOnTouchMove, { passive: false });
    window.addEventListener("touchend", this._boundOnTouchEnd, { passive: true });
    window.addEventListener("scroll", this._syncFromScroll, { passive: true });
    this._syncFromScroll();
  }

  detach() {
    window.removeEventListener("wheel", this._boundOnWheel);
    window.removeEventListener("touchstart", this._boundOnTouchStart);
    window.removeEventListener("touchmove", this._boundOnTouchMove);
    window.removeEventListener("touchend", this._boundOnTouchEnd);
    window.removeEventListener("scroll", this._syncFromScroll);
  }

  _syncFromScroll = () => {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    this.targetProgress = clamp01(window.scrollY / maxScroll);
  };

  _onWheel(event) {
    if (Math.abs(event.deltaY) < 0.5) return;
    this._wheelAccum += event.deltaY;
    if (Math.abs(this._wheelAccum) < 18) return;
    event.preventDefault();
    const direction = Math.sign(this._wheelAccum);
    this._wheelAccum = 0;
    this._nudge(direction);
  }

  _onTouchStart(event) {
    if (!event.touches.length) return;
    this._touchStartY = event.touches[0].clientY;
    this._touchLastY = this._touchStartY;
  }

  _onTouchMove(event) {
    if (!event.touches.length) return;
    const y = event.touches[0].clientY;
    const delta = this._touchLastY - y;
    this._touchLastY = y;
    if (Math.abs(delta) < 0.5) return;
    event.preventDefault();
    window.scrollBy({ top: delta * 1.35, behavior: "auto" });
    this._syncFromScroll();
  }

  _onTouchEnd() {
    const delta = this._touchStartY - this._touchLastY;
    if (Math.abs(delta) > 48) {
      this._nudge(Math.sign(delta));
    }
  }

  _nudge(direction) {
    const step = 1 / Math.max(1, this.sectionCount - 1);
    this.targetProgress = clamp01(this.targetProgress + direction * step);
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: this.targetProgress * maxScroll, behavior: "smooth" });
  }

  update(dt, lambda = 8) {
    const blend = 1 - Math.exp(-lambda * dt);
    this.progress += (this.targetProgress - this.progress) * blend;
    return this.progress;
  }

  getIndex() {
    return Math.min(
      this.sectionCount - 1,
      Math.round(this.progress * (this.sectionCount - 1))
    );
  }
}
