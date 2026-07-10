import { XP_BOOT_CONFIG } from "../ui/xpBoot/config.js";

/** Shared with XP boot and any future site audio. */
export const SITE_AUDIO_MUTE_KEY = "xp-audio-muted";

/** @type {Set<HTMLAudioElement>} */
const activeSfx = new Set();

/** @type {WeakSet<HTMLAudioElement>} */
const trackedSfx = new WeakSet();

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

export function isSiteAudioActive() {
  return activeSfx.size > 0;
}

function emitSiteAudioActivity() {
  window.dispatchEvent(
    new CustomEvent("siteaudioactivity", {
      detail: { active: activeSfx.size > 0 }
    })
  );
}

/**
 * Watch an audio element so the mute fab can pulse while it plays.
 * @param {HTMLAudioElement} audio
 */
export function trackSiteSfx(audio) {
  if (!audio || trackedSfx.has(audio)) return audio;
  trackedSfx.add(audio);

  const onStart = () => {
    if (audio.paused) return;
    activeSfx.add(audio);
    emitSiteAudioActivity();
  };
  const onStop = () => {
    if (!activeSfx.delete(audio)) return;
    emitSiteAudioActivity();
  };

  audio.addEventListener("playing", onStart);
  audio.addEventListener("pause", onStop);
  audio.addEventListener("ended", onStop);
  audio.addEventListener("emptied", onStop);
  return audio;
}

/**
 * Play a one-shot SFX (no-op when muted) and mark it as active for the fab pulse.
 * @param {HTMLAudioElement} audio
 * @param {{ volume?: number, restart?: boolean }} [opts]
 */
export function playSiteSfx(audio, opts = {}) {
  if (!audio || isSiteAudioMuted()) return;
  trackSiteSfx(audio);
  if (opts.volume != null) audio.volume = opts.volume;
  if (opts.restart !== false) audio.currentTime = 0;
  audio.play().catch(() => {});
}

/** @type {HTMLAudioElement | null} */
let linkClickAudio = null;

function getLinkClickAudio() {
  if (!linkClickAudio) {
    linkClickAudio = new Audio(XP_BOOT_CONFIG.assets.linkClick);
    linkClickAudio.preload = "auto";
    trackSiteSfx(linkClickAudio);
  }
  return linkClickAudio;
}

/** Windows Navigation Start — MySpace profile link clicks. */
export function playXpLinkClick() {
  playSiteSfx(getLinkClickAudio(), { volume: 0.85 });
}

const SIDEKICK_OPEN_URL = "/assets/sidekick/open.wav";
const SIDEKICK_CLOSE_URL = "/assets/sidekick/close.wav";

/** @type {HTMLAudioElement | null} */
let sidekickOpenAudio = null;
/** @type {HTMLAudioElement | null} */
let sidekickCloseAudio = null;

function getSidekickOpenAudio() {
  if (!sidekickOpenAudio) {
    sidekickOpenAudio = new Audio(SIDEKICK_OPEN_URL);
    sidekickOpenAudio.preload = "auto";
    trackSiteSfx(sidekickOpenAudio);
  }
  return sidekickOpenAudio;
}

function getSidekickCloseAudio() {
  if (!sidekickCloseAudio) {
    sidekickCloseAudio = new Audio(SIDEKICK_CLOSE_URL);
    sidekickCloseAudio.preload = "auto";
    trackSiteSfx(sidekickCloseAudio);
  }
  return sidekickCloseAudio;
}

/** Decode both clips early so open/close hits stay sample-tight to the swivel. */
export function preloadSidekickSfx() {
  const open = getSidekickOpenAudio();
  const close = getSidekickCloseAudio();
  open.load?.();
  close.load?.();
  // Warm the element without audible output (muted prime).
  const warm = (audio) => {
    const prev = audio.volume;
    audio.volume = 0;
    const p = audio.play();
    if (p) {
      p.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prev;
      }).catch(() => {
        audio.volume = prev;
      });
    } else {
      audio.volume = prev;
    }
  };
  if (!isSiteAudioMuted()) {
    warm(open);
    warm(close);
  }
}

/**
 * Restart one Sidekick clip immediately; only pause the opposite so we don't
 * stall the element we're about to play.
 * @param {HTMLAudioElement} audio
 * @param {HTMLAudioElement | null} other
 * @param {number} volume
 */
function playSidekickClip(audio, other, volume) {
  if (isSiteAudioMuted()) return;
  if (other && !other.paused) {
    other.pause();
    other.currentTime = 0;
  }
  trackSiteSfx(audio);
  audio.volume = volume;
  try {
    audio.pause();
  } catch {
    /* ignore */
  }
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/** Sidekick screen swivel open. */
export function playSidekickOpen() {
  playSidekickClip(getSidekickOpenAudio(), sidekickCloseAudio, 0.9);
}

/** Sidekick screen swivel closed. */
export function playSidekickClose() {
  playSidekickClip(getSidekickCloseAudio(), sidekickOpenAudio, 0.9);
}

export function stopSidekickSfx() {
  for (const audio of [sidekickOpenAudio, sidekickCloseAudio]) {
    if (!audio) continue;
    audio.pause();
    audio.currentTime = 0;
  }
}

window.addEventListener("siteaudiomutechange", (event) => {
  if (!event.detail.muted) return;
  for (const audio of [...activeSfx]) {
    audio.pause();
  }
  linkClickAudio?.pause();
  stopSidekickSfx();
});
