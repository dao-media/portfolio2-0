import {
  iconBattery,
  iconDevice,
  iconDocs,
  iconKeyM,
  iconLock,
  iconMenu,
  iconNetwork3G,
  iconSignal,
  iconSim,
  iconStorage
} from "./icons.js";

const SPLASH_URL = "/assets/models/sidekick/branding-splash.svg";

/** Classic Sidekick-era emoticon / emoji set for the smiley picker. */
export const SIDEKICK_EMOJIS = [
  "😀", "😁", "😂", "😃", "😄", "😅", "😆", "😇",
  "😉", "😊", "😋", "😌", "😍", "😎", "😏", "😐",
  "😑", "😒", "😓", "😔", "😕", "😖", "😗", "😘",
  "😙", "😚", "😛", "😜", "😝", "😞", "😟", "😠",
  "😡", "😢", "😣", "😤", "😥", "😨", "😩", "😪",
  "😫", "😬", "😭", "😮", "😯", "😰", "😱", "😲",
  "😳", "😴", "😵", "😶", "😷", "🙁", "🙂", "🙃",
  "👍", "👎", "👏", "👋", "✌️", "👌", "💪", "❤️",
  "💔", "💕", "💖", "💗", "💙", "💚", "💛", "💜",
  "⭐", "✨", "🔥", "💯", "🎉", "🎊", "☀️", "🌙",
  "⛈️", "❄️", "☕", "🍕", "🍔", "🍩", "🎵", "📱"
];

/** Always-visible strip in the compose toolbar. */
export const SIDEKICK_QUICK_EMOJIS = ["😀", "😂", "😍", "👍", "❤️"];

/**
 * @typedef {{
 *   formName?: string,
 *   formId?: string,
 *   method?: string,
 *   action?: string,
 *   webflowPageId?: string,
 *   webflowElementId?: string,
 * }} SidekickSmsDomOptions
 */

/**
 * Build the Sidekick SMS form DOM tree.
 * Includes Webflow form conventions (`data-name`, `w-input`, `w-form` done/fail).
 * Native screen was 240×160 — design canvas is 4.5× (1080×720).
 * @param {SidekickSmsDomOptions} [options]
 * @returns {HTMLElement}
 */
export function buildSidekickSmsDom(options = {}) {
  const formName = options.formName ?? "Sidekick SMS";
  const formId = options.formId ?? "wf-form-Sidekick-SMS";
  const method = (options.method ?? "POST").toUpperCase();
  const action = options.action ?? "";
  const pageId = options.webflowPageId ?? "";
  const elementId = options.webflowElementId ?? "";

  const wfPageAttr = pageId ? ` data-wf-page-id="${escapeAttr(pageId)}"` : "";
  const wfElAttr = elementId ? ` data-wf-element-id="${escapeAttr(elementId)}"` : "";
  const actionAttr = action ? ` action="${escapeAttr(action)}"` : "";

  const root = document.createElement("div");
  root.className = "sk-sms";
  root.dataset.screen = "splash";
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "Sidekick text message form");

  root.innerHTML = `
    <div class="sk-sms__bezel" aria-hidden="true"></div>
    <div class="sk-sms__screen">
      <div class="sk-sms__lcd">
        <section class="sk-screen sk-screen--splash" data-sk-screen="splash" aria-label="Sidekick splash">
          <button type="button" class="sk-splash" id="sk-splash-enter" aria-label="Open compose message">
            <img class="sk-splash__img" src="${SPLASH_URL}" alt="T-Mobile Sidekick" width="1080" height="360" draggable="false" />
            <span class="sk-splash__hint">tap to compose</span>
          </button>
        </section>

        <section class="sk-screen sk-screen--compose" data-sk-screen="compose" hidden aria-label="Compose message">
          <div class="w-form sk-w-form">
            <form
              class="sk-compose"
              id="${escapeAttr(formId)}"
              name="${escapeAttr(formId)}"
              data-name="${escapeAttr(formName)}"
              method="${escapeAttr(method)}"${actionAttr}${wfPageAttr}${wfElAttr}
              novalidate
            >
              <input
                type="text"
                class="sk-honeypot"
                name="bot-field"
                data-name="Bot Field"
                tabindex="-1"
                autocomplete="off"
                aria-hidden="true"
              />

              <header class="sk-chrome">
                <div class="sk-chrome__left">
                  <div class="sk-badge">
                    <span class="sk-badge__icon">${iconDevice("#ffffff")}</span>
                    <div class="sk-badge__text">
                      <span class="sk-badge__title">Compose</span>
                      <span class="sk-badge__sub">
                        <span class="sk-badge__lock">${iconLock("#c8dff5")}</span>
                        1 message
                      </span>
                    </div>
                  </div>
                </div>
                <div class="sk-chrome__right">
                  <time class="sk-chrome__clock" id="sk-clock" datetime=""></time>
                  <div class="sk-chrome__status" aria-hidden="true">
                    <span class="sk-ico sk-ico--net">${iconNetwork3G("#3a8fd4")}</span>
                    <span class="sk-ico sk-ico--sig">${iconSignal("#3a8fd4")}</span>
                    <span class="sk-ico sk-ico--bat">${iconBattery("#3a8fd4")}</span>
                  </div>
                </div>
              </header>

              <div class="sk-compose__body">
                <label class="sk-field">
                  <span class="sk-field__label">Name</span>
                  <input
                    class="sk-field__input w-input"
                    type="text"
                    name="name"
                    data-name="Name"
                    id="sk-name"
                    autocomplete="name"
                    maxlength="256"
                    required
                  />
                </label>

                <label class="sk-field">
                  <span class="sk-field__label">Email</span>
                  <input
                    class="sk-field__input w-input"
                    type="email"
                    name="email"
                    data-name="Email"
                    id="sk-email"
                    autocomplete="email"
                    maxlength="256"
                    required
                  />
                </label>

                <label class="sk-field">
                  <span class="sk-field__label">Phone</span>
                  <input
                    class="sk-field__input w-input"
                    type="tel"
                    name="phone"
                    data-name="Phone"
                    id="sk-phone"
                    autocomplete="tel"
                    maxlength="256"
                    required
                  />
                </label>

                <div class="sk-message">
                  <span class="visually-hidden">Message</span>
                  <div class="sk-message__box">
                    <div class="sk-toolbar" role="toolbar" aria-label="Emoticons">
                      ${SIDEKICK_QUICK_EMOJIS.map(
                        (emoji) =>
                          `<button type="button" class="sk-toolbar__emoji" data-emoji="${emoji}" aria-label="Insert ${emoji}">${emoji}</button>`
                      ).join("")}
                      <button
                        type="button"
                        class="sk-toolbar__more"
                        id="sk-emoji-toggle"
                        title="More emoticons"
                        aria-label="More emoticons"
                        aria-expanded="false"
                        aria-controls="sk-emoji-panel"
                      >
                        <span class="sk-toolbar__more-label" aria-hidden="true">››</span>
                      </button>
                    </div>

                    <div class="sk-message__editor">
                      <textarea
                        class="sk-message__input w-input"
                        name="message"
                        data-name="Message"
                        id="sk-message"
                        rows="4"
                        maxlength="5000"
                        required
                        placeholder=""
                        aria-label="Message"
                      ></textarea>

                      <div
                        class="sk-emoji"
                        id="sk-emoji-panel"
                        role="listbox"
                        aria-label="All emoticons"
                        hidden
                      >
                        <div class="sk-emoji__chrome">
                          <span class="sk-emoji__title">Emoticons</span>
                          <button type="button" class="sk-emoji__close" id="sk-emoji-close" aria-label="Close emoji panel">×</button>
                        </div>
                        <div class="sk-emoji__grid" id="sk-emoji-grid">
                          ${SIDEKICK_EMOJIS.map(
                            (emoji) =>
                              `<button type="button" class="sk-emoji__cell" role="option" data-emoji="${emoji}" aria-label="Insert ${emoji}">${emoji}</button>`
                          ).join("")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <footer class="sk-footer">
                <div class="sk-footer__left">
                  <span class="sk-footer__ico">${iconDocs("#222")}</span>
                  <span class="sk-footer__meta">1 message</span>
                </div>
                <button type="submit" class="sk-send w-button" id="sk-send" data-wait="Sending...">
                  <span class="sk-send__label">Send</span>
                  <span class="sk-send__menu" aria-hidden="true">${iconMenu("#222")}</span>
                  <span class="sk-send__key" aria-hidden="true">${iconKeyM()}</span>
                </button>
              </footer>
            </form>

            <div class="w-form-done" tabindex="-1" role="region" aria-label="Form submitted">
              <div>Thank you! Your message has been sent.</div>
            </div>
            <div class="w-form-fail" tabindex="-1" role="region" aria-label="Form error">
              <div>Oops! Something went wrong while submitting the form.</div>
            </div>
          </div>
        </section>

        <section class="sk-screen sk-screen--sent" data-sk-screen="sent" hidden aria-live="polite" aria-label="Message sent">
          <header class="sk-chrome sk-chrome--inbox">
            <div class="sk-chrome__left">
              <div class="sk-inbox-title">
                <span class="sk-inbox-title__ico">${iconDevice("#ffffff")}</span>
                <div>
                  <div class="sk-inbox-title__text">Text Messages</div>
                  <div class="sk-inbox-title__counts">
                    <span class="sk-count"><span class="sk-count__ico">${iconSim("#fff")}</span> 1/30</span>
                    <span class="sk-count"><span class="sk-count__ico">${iconStorage("#fff")}</span> 1/100</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="sk-chrome__right">
              <time class="sk-chrome__clock sk-chrome__clock--light" id="sk-clock-sent"></time>
              <div class="sk-chrome__status" aria-hidden="true">
                <span class="sk-ico sk-ico--net">${iconNetwork3G("#7ec8f5")}</span>
                <span class="sk-ico sk-ico--sig">${iconSignal("#7ec8f5")}</span>
                <span class="sk-ico sk-ico--bat">${iconBattery("#7ec8f5", "#7ec8f5")}</span>
              </div>
            </div>
          </header>

          <div class="sk-sent">
            <div class="sk-sent__row is-selected">
              <span class="sk-sent__name" id="sk-sent-name">You</span>
              <span class="sk-sent__preview" id="sk-sent-preview">Message sent!</span>
              <span class="sk-sent__date" id="sk-sent-date"></span>
            </div>
            <div class="sk-sent__preview-pane">
              <p class="sk-sent__body" id="sk-sent-body"></p>
            </div>
            <button type="button" class="sk-sent__again" id="sk-compose-again">New Message</button>
          </div>
        </section>

        <div class="sk-sms__grid" aria-hidden="true"></div>
      </div>
    </div>
  `;

  return root;
}

/** @param {string} value */
function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
