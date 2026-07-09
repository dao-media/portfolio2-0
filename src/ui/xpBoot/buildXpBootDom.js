import { XP_BOOT_CONFIG } from "./config.js";

function xpLoginLogo() {
  return `<img class="xp-login-logo" src="${XP_BOOT_CONFIG.assets.loginLogo}" alt="Microsoft Windows XP" width="320" height="240" />`;
}

function adminAvatarImg() {
  return `<img class="xp-user-tile__avatar" src="${XP_BOOT_CONFIG.assets.avatar}" alt="" width="64" height="64" />`;
}

function guestAvatarImg() {
  return `<img class="xp-user-tile__avatar" src="${XP_BOOT_CONFIG.assets.guestAvatar}" alt="" width="64" height="64" />`;
}

/**
 * XP boot UI sized for CRT capture (1024×768), not full viewport.
 * @param {number} width
 * @param {number} height
 */
export function buildXpBootCrtRoot(width, height) {
  const root = document.createElement("div");
  root.id = "xp-crt-root";
  root.className = "xp-crt";
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;

  root.innerHTML = `
    <button type="button" class="xp-crt__skip" id="xp-boot-skip">skip →</button>

    <section class="xp-phase xp-phase--power is-active" data-phase="power" hidden>
      <button type="button" class="xp-power-btn" id="xp-power-btn" aria-label="Press power">
        <span class="xp-power-btn__ring"></span>
        <span class="xp-power-btn__led"></span>
      </button>
      <p class="xp-power-label">PRESS POWER</p>
    </section>

    <section class="xp-phase xp-phase--boot" data-phase="boot" hidden>
      <img
        class="xp-boot-bg"
        src="${XP_BOOT_CONFIG.assets.bootScreen}"
        alt=""
        width="${width}"
        height="${height}"
      />
      <div class="xp-boot-bar" aria-hidden="true">
        <span class="xp-boot-bar__block"></span>
        <span class="xp-boot-bar__block"></span>
        <span class="xp-boot-bar__block"></span>
      </div>
    </section>

    <section class="xp-phase xp-phase--welcome" data-phase="welcome" hidden>
      <img
        class="xp-welcome-screen"
        src="${XP_BOOT_CONFIG.assets.welcomeScreen}"
        alt=""
        width="${width}"
        height="${height}"
      />
    </section>

    <section class="xp-phase xp-phase--login" data-phase="login" hidden>
      <div class="xp-login-main">
        <div class="xp-login-divider" aria-hidden="true"></div>
        <div class="xp-login-left">
          ${xpLoginLogo()}
          <p class="xp-login-prompt" id="xp-login-prompt">To begin, click your user name</p>
        </div>
        <div class="xp-login-users">
          <button type="button" class="xp-user-tile" id="xp-user-admin" data-user="admin">
            <span class="xp-user-tile__frame">
              ${adminAvatarImg()}
            </span>
            <span class="xp-user-tile__name">Dane O'Leary</span>
          </button>
          <div class="xp-user-tile xp-user-tile--disabled" id="xp-user-guest" data-user="guest" aria-disabled="true">
            <span class="xp-user-tile__frame">
              ${guestAvatarImg()}
            </span>
            <span class="xp-user-tile__name">Guest</span>
          </div>
        </div>
      </div>
    </section>
  `;

  return root;
}
