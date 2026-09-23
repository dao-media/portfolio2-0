import { CASE_STUDIES, getCaseStudy } from "../content/caseStudies.js";

/**
 * Full-bleed case study sheet over the stage (editorial / Frontify-style).
 */
export class DuoCaseStudyOverlay {
  /**
   * @param {{
   *   root?: HTMLElement | null,
   *   onBack?: () => void,
   *   onClose?: () => void
   * }} [opts]
   */
  constructor(opts = {}) {
    this.root = opts.root ?? document.getElementById("duo-case-study-overlay");
    this.onBack = opts.onBack ?? null;
    this.onClose = opts.onClose ?? null;
    this._open = false;
    this._slug = null;
    if (!this.root) return;

    this.root.innerHTML = `
      <div class="duo-cs" role="dialog" aria-modal="true" aria-label="Case study">
        <header class="duo-cs__nav">
          <button type="button" class="duo-cs__back">← Back</button>
          <button type="button" class="duo-cs__close" aria-label="Close">Close</button>
        </header>
        <div class="duo-cs__scroll">
          <article class="duo-cs__article"></article>
        </div>
      </div>
    `;

    this._article = this.root.querySelector(".duo-cs__article");
    this.root.querySelector(".duo-cs__back")?.addEventListener("click", () => {
      this.onBack?.();
    });
    this.root.querySelector(".duo-cs__close")?.addEventListener("click", () => {
      this.onClose?.();
    });
  }

  /**
   * @param {string} slug
   */
  open(slug) {
    if (!this.root) return;
    const study = getCaseStudy(slug);
    if (!study) return;
    this._slug = slug;
    this._open = true;
    this._render(study);
    this.root.hidden = false;
    this.root.classList.add("is-open");
    const scroller = this.root.querySelector(".duo-cs__scroll");
    if (scroller) scroller.scrollTop = 0;
    requestAnimationFrame(() => {
      this.root.querySelector(".duo-cs__back")?.focus?.();
    });
  }

  close() {
    if (!this.root) return;
    this._open = false;
    this._slug = null;
    this.root.classList.remove("is-open");
    this.root.hidden = true;
  }

  get isOpen() {
    return this._open;
  }

  get slug() {
    return this._slug;
  }

  /** @param {import("../content/caseStudies.js").CaseStudy} study */
  _render(study) {
    if (!this._article) return;

    const hero = study.image
      ? `<img class="duo-cs__hero-img" src="${study.image}" alt="" onerror="this.classList.add('is-missing')" />`
      : `<div class="duo-cs__hero-img duo-cs__hero-img--placeholder" data-slug="${study.slug}"></div>`;

    const stats =
      Array.isArray(study.stats) && study.stats.length
        ? `<div class="duo-cs__stats" role="list">
            ${study.stats
              .map(
                (s) => `
              <div class="duo-cs__stat" role="listitem">
                <div class="duo-cs__stat-value">${escapeHtml(s.value)}</div>
                <div class="duo-cs__stat-label">${escapeHtml(s.label)}</div>
              </div>`
              )
              .join("")}
          </div>`
        : "";

    const more = CASE_STUDIES.filter((c) => c.slug !== study.slug)
      .slice(0, 3)
      .map(
        (c) => `
      <button type="button" class="duo-cs__more-card" data-slug="${c.slug}">
        <span class="duo-cs__more-cat">${escapeHtml(c.category)}</span>
        <span class="duo-cs__more-title">${escapeHtml(c.title)}</span>
        ${
          c.image
            ? `<img class="duo-cs__more-thumb" src="${c.image}" alt="" loading="lazy" />`
            : `<span class="duo-cs__more-thumb duo-cs__more-thumb--ph" data-slug="${c.slug}"></span>`
        }
      </button>`
      )
      .join("");

    this._article.innerHTML = `
      <header class="duo-cs__hero">
        <p class="duo-cs__eyebrow">${escapeHtml(study.category)}</p>
        <h1 class="duo-cs__title">${escapeHtml(study.title)}</h1>
        <div class="duo-cs__hero-media">${hero}</div>
      </header>

      <section class="duo-cs__overview">
        <aside class="duo-cs__meta">
          <div class="duo-cs__meta-row">
            <span class="duo-cs__meta-key">Client</span>
            <span class="duo-cs__meta-val">${escapeHtml(study.from)}</span>
          </div>
          <div class="duo-cs__meta-row">
            <span class="duo-cs__meta-key">Discipline</span>
            <span class="duo-cs__meta-val">${escapeHtml(study.category)}</span>
          </div>
        </aside>
        <p class="duo-cs__lede">${escapeHtml(study.summary)}</p>
      </section>

      ${stats}

      <div class="duo-cs__body">${study.bodyHtml}</div>

      <p class="duo-cs__source">
        <a href="${study.sourceUrl}" target="_blank" rel="noopener noreferrer">View on daneoleary.com →</a>
      </p>

      ${
        more
          ? `<section class="duo-cs__more">
              <h2 class="duo-cs__more-heading">More stories</h2>
              <div class="duo-cs__more-grid">${more}</div>
            </section>`
          : ""
      }
    `;

    this._article.querySelectorAll(".duo-cs__more-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-slug");
        if (next) this.open(next);
      });
    });
  }
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
