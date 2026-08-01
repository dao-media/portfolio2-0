import { buildSidekickSmsDom } from "./buildDom.js";

/** Same gray remap as the 3D splash — authored SVG uses washed #9a9c9f / #a1a1a1. */
const SPLASH_GRAY_REMAP = [
  ["#9a9c9f", "#3d4044"],
  ["#a1a1a1", "#454545"]
];

/**
 * @typedef {{
 *   name: string,
 *   email: string,
 *   phone: string,
 *   message: string
 * }} SidekickSmsPayload
 *
 * @typedef {{
 *   onSubmit?: (payload: SidekickSmsPayload) => void | Promise<void>,
 *   formName?: string,
 *   formId?: string,
 *   method?: string,
 *   action?: string,
 *   webflowPageId?: string,
 *   webflowElementId?: string,
 *   webflowForm?: string | HTMLFormElement | null,
 *   fieldMap?: {
 *     name?: string,
 *     email?: string,
 *     phone?: string,
 *     message?: string
 *   }
 * }} SidekickSmsOptions
 */

/**
 * Standalone Sidekick 3 SMS compose UI used as a contact form.
 * Splash → Compose → Sent. Independent of the 3D scene.
 *
 * Webflow notes:
 * - Built-in markup uses `data-name`, `w-input`, `w-button`, and `w-form` done/fail.
 * - Pass `webflowForm` to sync into a real Designer form (recommended for Form notifications).
 * - Or set `action` to POST FormData to Formspree / a custom endpoint.
 */
export class SidekickSmsForm {
  /** @param {SidekickSmsOptions} [options] */
  constructor(options = {}) {
    this.onSubmit = options.onSubmit ?? null;
    this.fieldMap = {
      name: options.fieldMap?.name ?? "name",
      email: options.fieldMap?.email ?? "email",
      phone: options.fieldMap?.phone ?? "phone",
      message: options.fieldMap?.message ?? "message"
    };

    this.root = buildSidekickSmsDom({
      formName: options.formName,
      formId: options.formId,
      method: options.method,
      action: options.action,
      webflowPageId: options.webflowPageId,
      webflowElementId: options.webflowElementId
    });

    this._clockTimer = 0;
    this._submitting = false;
    this._splashObjectUrl = null;
    this._webflowForm = resolveFormEl(options.webflowForm);

    this._els = {
      splashEnter: this.root.querySelector("#sk-splash-enter"),
      splashImg: this.root.querySelector(".sk-splash__img"),
      form: this.root.querySelector("form.sk-compose"),
      formDone: this.root.querySelector(".w-form-done"),
      formFail: this.root.querySelector(".w-form-fail"),
      clock: this.root.querySelector("#sk-clock"),
      clockSent: this.root.querySelector("#sk-clock-sent"),
      name: this.root.querySelector("#sk-name"),
      email: this.root.querySelector("#sk-email"),
      phone: this.root.querySelector("#sk-phone"),
      message: this.root.querySelector("#sk-message"),
      send: this.root.querySelector("#sk-send"),
      again: this.root.querySelector("#sk-compose-again"),
      sentName: this.root.querySelector("#sk-sent-name"),
      sentPreview: this.root.querySelector("#sk-sent-preview"),
      sentBody: this.root.querySelector("#sk-sent-body"),
      sentDate: this.root.querySelector("#sk-sent-date"),
      emojiToggle: this.root.querySelector("#sk-emoji-toggle"),
      emojiPanel: this.root.querySelector("#sk-emoji-panel"),
      emojiGrid: this.root.querySelector("#sk-emoji-grid"),
      emojiClose: this.root.querySelector("#sk-emoji-close")
    };

    this._emojiOpen = false;
    this._bind();
    this._tickClock();
    void this._darkenSplash();
  }

  /** @param {HTMLElement | null} container */
  mount(container) {
    if (!container) return;
    container.replaceChildren(this.root);
    this._clockTimer = window.setInterval(() => this._tickClock(), 30_000);
  }

  destroy() {
    window.clearInterval(this._clockTimer);
    if (this._splashObjectUrl) {
      URL.revokeObjectURL(this._splashObjectUrl);
      this._splashObjectUrl = null;
    }
    this.root.remove();
  }

  async _darkenSplash() {
    const img = this._els.splashImg;
    if (!img?.src) return;
    try {
      const response = await fetch(img.getAttribute("src") || img.src);
      let svgText = await response.text();
      for (const [from, to] of SPLASH_GRAY_REMAP) {
        svgText = svgText.replaceAll(from, to);
        svgText = svgText.replaceAll(from.toUpperCase(), to);
      }
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      this._splashObjectUrl = URL.createObjectURL(blob);
      img.src = this._splashObjectUrl;
    } catch {
      /* keep authored SVG */
    }
  }

  /** @param {"splash" | "compose" | "sent"} name */
  showScreen(name) {
    this.root.dataset.screen = name;
    this.root.querySelectorAll("[data-sk-screen]").forEach((el) => {
      const match = el.dataset.skScreen === name;
      el.hidden = !match;
    });

    this._setEmojiOpen(false);

    if (name === "compose") {
      this._setWebflowState(null);
      queueMicrotask(() => this._els.name?.focus());
    }
  }

  _bind() {
    this._els.splashEnter?.addEventListener("click", () => this.showScreen("compose"));

    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target === this._els.splashEnter) {
        event.preventDefault();
        this.showScreen("compose");
      }
      if (event.key === "Escape" && this._emojiOpen) {
        event.preventDefault();
        this._setEmojiOpen(false);
        this._els.emojiToggle?.focus();
        return;
      }
      if (
        this.root.dataset.screen === "compose" &&
        event.key.toLowerCase() === "m" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        this._els.form?.requestSubmit();
      }
    });

    this._els.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this._handleSubmit();
    });

    this.root.querySelectorAll(".sk-field__input, .sk-message__input").forEach((input) => {
      input.addEventListener("focus", () => {
        input.closest(".sk-field, .sk-message")?.classList.add("is-focused");
      });
      input.addEventListener("blur", () => {
        input.closest(".sk-field, .sk-message")?.classList.remove("is-focused");
      });
    });

    this._els.again?.addEventListener("click", () => {
      this._els.form?.reset();
      this._setWebflowState(null);
      this.showScreen("compose");
    });

    this._els.emojiToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._setEmojiOpen(!this._emojiOpen);
    });

    this._els.emojiClose?.addEventListener("click", (event) => {
      event.preventDefault();
      this._setEmojiOpen(false);
      this._els.message?.focus();
    });

    this.root.querySelector(".sk-toolbar")?.addEventListener("click", (event) => {
      const cell = event.target.closest(".sk-toolbar__emoji[data-emoji]");
      if (!cell) return;
      event.preventDefault();
      this._insertAtCursor(cell.dataset.emoji ?? "");
    });

    this._els.emojiGrid?.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-emoji]");
      if (!cell) return;
      event.preventDefault();
      this._insertAtCursor(cell.dataset.emoji ?? "");
    });

    this.root.addEventListener("pointerdown", (event) => {
      if (!this._emojiOpen) return;
      const t = event.target;
      if (
        t instanceof Element &&
        (t.closest("#sk-emoji-panel") || t.closest("#sk-emoji-toggle"))
      ) {
        return;
      }
      this._setEmojiOpen(false);
    });
  }

  /** @param {boolean} open */
  _setEmojiOpen(open) {
    this._emojiOpen = open;
    if (this._els.emojiPanel) this._els.emojiPanel.hidden = !open;
    this._els.emojiToggle?.setAttribute("aria-expanded", open ? "true" : "false");
    this._els.emojiToggle?.classList.toggle("is-active", open);
    this.root.classList.toggle("sk-sms--emoji-open", open);
  }

  /** @param {string} text */
  _insertAtCursor(text) {
    const field = this._els.message;
    if (!field || !text) return;

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const before = field.value.slice(0, start);
    const after = field.value.slice(end);
    const next = before + text + after;
    const max = Number(field.getAttribute("maxlength")) || 5000;

    if (next.length > max) return;

    field.value = next;
    const caret = start + text.length;
    field.focus();
    field.setSelectionRange(caret, caret);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  _tickClock() {
    const now = new Date();
    const text = formatSidekickClock(now);
    const iso = now.toISOString();
    if (this._els.clock) {
      this._els.clock.textContent = text;
      this._els.clock.dateTime = iso;
    }
    if (this._els.clockSent) {
      this._els.clockSent.textContent = text;
      this._els.clockSent.dateTime = iso;
    }
  }

  async _handleSubmit() {
    if (this._submitting) return;

    const honeypot = this.root.querySelector(".sk-honeypot");
    if (honeypot instanceof HTMLInputElement && honeypot.value.trim()) {
      // Bot filled honeypot — fake success without sending
      this._showSent({ name: "Friend", email: "", phone: "", message: "Message sent!" });
      return;
    }

    const name = this._els.name?.value.trim() ?? "";
    const email = this._els.email?.value.trim() ?? "";
    const phone = this._els.phone?.value.trim() ?? "";
    const message = this._els.message?.value.trim() ?? "";

    if (!name || !email || !phone || !message) {
      this._shakeInvalid();
      return;
    }

    if (!isPlausibleEmail(email)) {
      this._els.email?.focus();
      this._els.email?.classList.add("is-invalid");
      return;
    }

    const payload = { name, email, phone, message };
    this._submitting = true;
    this._els.send?.classList.add("is-sending");
    this._setWebflowState(null);

    try {
      if (this.onSubmit) {
        await this.onSubmit(payload);
      } else if (this._webflowForm) {
        await this._submitThroughWebflowForm(payload);
      } else if (this._els.form?.getAttribute("action")) {
        await this._submitFormAction(payload);
      } else {
        this.root.dispatchEvent(
          new CustomEvent("sidekicksmsubmit", { detail: payload, bubbles: true })
        );
      }
      this._setWebflowState("done");
      this._showSent(payload);
    } catch (err) {
      console.error("[SidekickSmsForm] submit failed", err);
      this._setWebflowState("fail");
      this._els.send?.classList.add("is-error");
      window.setTimeout(() => this._els.send?.classList.remove("is-error"), 1200);
    } finally {
      this._submitting = false;
      this._els.send?.classList.remove("is-sending");
    }
  }

  /**
   * Copy values into a Designer form and let Webflow.js handle delivery.
   * @param {SidekickSmsPayload} payload
   */
  async _submitThroughWebflowForm(payload) {
    const form = this._webflowForm;
    if (!form) throw new Error("Webflow form not found");

    setWebflowField(form, this.fieldMap.name, payload.name);
    setWebflowField(form, this.fieldMap.email, payload.email);
    setWebflowField(form, this.fieldMap.phone, payload.phone);
    setWebflowField(form, this.fieldMap.message, payload.message);

    await waitForWebflowFormResult(form);
  }

  /**
   * POST FormData to the form `action` (Formspree, custom worker, etc.).
   * @param {SidekickSmsPayload} _payload
   */
  async _submitFormAction(_payload) {
    const form = this._els.form;
    if (!form) throw new Error("Form missing");
    const action = form.getAttribute("action");
    if (!action) throw new Error("Form action missing");

    const body = new FormData(form);
    // Drop honeypot from outbound if empty
    if (!String(body.get("bot-field") ?? "").trim()) {
      body.delete("bot-field");
    }

    const method = (form.getAttribute("method") || "POST").toUpperCase();
    const response = await fetch(action, {
      method,
      body,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Form POST failed (${response.status})`);
    }
  }

  /** @param {"done" | "fail" | null} state */
  _setWebflowState(state) {
    const done = this._els.formDone;
    const fail = this._els.formFail;
    if (done) {
      done.style.display = state === "done" ? "block" : "none";
      done.classList.toggle("sk-w-form-visible", state === "done");
    }
    if (fail) {
      fail.style.display = state === "fail" ? "block" : "none";
      fail.classList.toggle("sk-w-form-visible", state === "fail");
    }
  }

  /** @param {SidekickSmsPayload} payload */
  _showSent(payload) {
    const now = new Date();
    const shortDate = `${now.getMonth() + 1}/${now.getDate()}`;
    const preview =
      payload.message.length > 22 ? `${payload.message.slice(0, 20)}…` : payload.message;

    if (this._els.sentName) this._els.sentName.textContent = payload.name;
    if (this._els.sentPreview) this._els.sentPreview.textContent = preview;
    if (this._els.sentBody) this._els.sentBody.textContent = payload.message;
    if (this._els.sentDate) this._els.sentDate.textContent = shortDate;

    this.showScreen("sent");
  }

  _shakeInvalid() {
    const form = this._els.form;
    if (!form) return;
    form.classList.remove("is-shake");
    void form.offsetWidth;
    form.classList.add("is-shake");

    const firstEmpty = [this._els.name, this._els.email, this._els.phone, this._els.message].find(
      (el) => el && !el.value.trim()
    );
    firstEmpty?.focus();
  }
}

/** @param {string | HTMLFormElement | null | undefined} target */
function resolveFormEl(target) {
  if (!target) return null;
  if (typeof target === "string") {
    const el = document.querySelector(target);
    return el instanceof HTMLFormElement ? el : null;
  }
  return target instanceof HTMLFormElement ? target : null;
}

/**
 * @param {HTMLFormElement} form
 * @param {string} nameOrSelector
 * @param {string} value
 */
function setWebflowField(form, nameOrSelector, value) {
  const byName = form.elements.namedItem(nameOrSelector);
  /** @type {HTMLElement | null} */
  let el = null;
  if (byName instanceof HTMLElement) el = byName;
  else if (byName && "length" in byName && byName[0] instanceof HTMLElement) el = byName[0];
  else el = form.querySelector(nameOrSelector);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 * Trigger submit on a Webflow-managed form and wait for success/fail.
 * @param {HTMLFormElement} form
 * @returns {Promise<void>}
 */
function waitForWebflowFormResult(form) {
  return new Promise((resolve, reject) => {
    const timeoutMs = 12_000;
    let settled = false;

    const cleanup = () => {
      form.removeEventListener("formSuccess", onSuccess);
      form.removeEventListener("formError", onError);
      window.clearTimeout(timer);
    };

    const onSuccess = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Webflow form submission failed"));
    };

    form.addEventListener("formSuccess", onSuccess);
    form.addEventListener("formError", onError);

    // Webflow also emits jQuery events when $ is present
    const $ = /** @type {{ fn?: unknown, (el: HTMLElement): { one: Function, trigger: Function } } | undefined} */ (
      window.jQuery || window.$
    );
    if ($ && typeof $ === "function") {
      $(form).one("formSuccess", onSuccess);
      $(form).one("formError formfail", onError);
      $(form).trigger("submit");
    } else {
      // Fallback: native requestSubmit — Webflow may still intercept
      form.requestSubmit();
      // If nothing answers, treat action POST path
      window.setTimeout(() => {
        if (settled) return;
        if (form.getAttribute("action")) {
          const body = new FormData(form);
          fetch(form.getAttribute("action"), {
            method: (form.getAttribute("method") || "POST").toUpperCase(),
            body,
            headers: { Accept: "application/json" }
          })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              onSuccess();
            })
            .catch(onError);
        }
      }, 400);
    }

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Webflow form submission timed out"));
    }, timeoutMs);
  });
}

/** @param {Date} date */
function formatSidekickClock(date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours24 = date.getHours();
  const hour12 = hours24 % 12 || 12;
  const m = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hours24 < 12 ? "AM" : "PM";
  return `${months[date.getMonth()]} ${date.getDate()}, ${hour12}:${m} ${meridiem}`;
}

/** @param {string} email */
function isPlausibleEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
