import { XP_BOOT_CONFIG } from "../ui/xpBoot/config.js";

/** Shared with XP boot and any future site audio. */
export const SITE_AUDIO_MUTE_KEY = "xp-audio-muted";

export function isSiteAudioMuted() {
  return sessionStorage.getItem(SITE_AUDIO_MUTE_KEY) === "1";
}

/** @param {boolean} muted */
export function setSiteAudioMuted(muted) {
  sessionStorage.setItem(SITE_AUDIO_MUTE_KEY, muted ? "1" : "0");
  window.dispatchEvent(
    new CustomEvent("siteaudiomutechange", { detail: { muted } })
  );
}

export function toggleSiteAudioMuted() {
  setSiteAudioMuted(!isSiteAudioMuted());
  return isSiteAudioMuted();
}

/** @type {HTMLAudioElement | null} */
let linkClickAudio = null;

function getLinkClickAudio() {
  if (!linkClickAudio) {
    linkClickAudio = new Audio(XP_BOOT_CONFIG.assets.linkClick);
    linkClickAudio.preload = "auto";
  }
  return linkClickAudio;
}

/** Windows Navigation Start — MySpace profile link clicks. */
export function playXpLinkClick() {
  if (isSiteAudioMuted()) return;
  const audio = getLinkClickAudio();
  audio.volume = 0.85;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

window.addEventListener("siteaudiomutechange", (event) => {
  if (event.detail.muted) {
    linkClickAudio?.pause();
  }
});
