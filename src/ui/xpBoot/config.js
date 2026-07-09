/** Timing + asset paths — tune the boot flow here. */
export const XP_BOOT_CONFIG = {
  storageKey: "xp-booted",
  muteKey: "xp-audio-muted",

  assets: {
    startup: "/assets/xp/startup.mp3",
    /** XP login tile click → MySpace transition. */
    login: "/assets/xp/xp-balloon.wav",
    /** XP navigation click — MySpace profile links. */
    linkClick: "/assets/xp/navigation-start.wav",
    avatar: "/assets/xp/dane-avatar.png",
    guestAvatar: "/assets/xp/guest-avatar.png",
    loginLogo: "/assets/xp/windows-xp-login-logo.png",
    welcomeScreen: "/assets/xp/welcome-screen.png",
    bootScreen: "/assets/xp/windows-xp-boot-screen.png"
  },

  /** CRT warm-up before the Windows boot screen (ms). */
  crtPowerOnMs: 1150,

  /** Phase durations (ms). */
  bootDuration: 4000,
  bootFadeMs: 400,
  welcomeDuration: 2500,
  loginLoadMs: 1200,

  /** Reserved — post-login desktop beat (not an auto-login timeout). */
  desktopAutoEnterMs: 3200,

  /** IE window auto-open delay after desktop appears. */
  ieOpenDelayMs: 800
};

export const XP_BOOT_STATES = {
  POWER: "power",
  BOOT: "boot",
  WELCOME: "welcome",
  LOGIN: "login",
  DESKTOP: "desktop",
  DONE: "done"
};
