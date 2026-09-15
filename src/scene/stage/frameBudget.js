/**
 * DEV frame tags for the post-land hitch. Not a second loop — the stage
 * rAF calls begin/end. Other modules push tags for the work they actually ran.
 */
const SLOW_MS = 48;
const MAX_SLOW = 80;

/** @type {ReturnType<typeof createFrameBudget> | null} */
let active = null;

export function setActiveFrameBudget(budget) {
  active = budget;
}

export function tagFrame(name) {
  active?.tag(name);
}

export async function spanFrame(name, fn) {
  active?.start(name);
  try {
    return await fn();
  } finally {
    active?.endSpan(name);
  }
}

export function createFrameBudget() {
  /** @type {{ t: number, dtMs: number, tags: string[] }[]} */
  const slow = [];
  /** @type {{ name: string, ms: number, t: number }[]} */
  const spans = [];
  let tags = [];
  /** @type {{ name: string, t: number }[]} */
  const stack = [];

  return {
    begin() {
      tags = [];
    },

    tag(name) {
      if (name) tags.push(name);
    },

    start(name) {
      stack.push({ name, t: performance.now() });
    },

    endSpan(name) {
      const idx = name ? stack.findLastIndex((row) => row.name === name) : stack.length - 1;
      if (idx < 0) return;
      const open = stack.splice(idx, 1)[0];
      const ms = performance.now() - open.t;
      spans.push({ name: open.name, ms: Math.round(ms), t: Math.round(open.t) });
      tags.push(`${open.name}:${Math.round(ms)}ms`);
    },

    /**
     * @param {number} dtSec
     */
    end(dtSec) {
      const dtMs = dtSec * 1000;
      if (dtMs < SLOW_MS) return;
      slow.push({
        t: Math.round(performance.now()),
        dtMs: Math.round(dtMs),
        tags: tags.slice()
      });
      if (slow.length > MAX_SLOW) slow.shift();
    },

    dump() {
      const byTag = {};
      for (const row of slow) {
        const key = row.tags.length ? row.tags.join("|") : "(untagged)";
        const slot = byTag[key] ?? { n: 0, ms: 0 };
        slot.n += 1;
        slot.ms += row.dtMs;
        byTag[key] = slot;
      }
      return {
        slowCount: slow.length,
        worst: slow.slice().sort((a, b) => b.dtMs - a.dtMs).slice(0, 12),
        spans: spans.slice(-24),
        byTag
      };
    },

    /** Clear slow/span history between cost-matrix cases. */
    reset() {
      slow.length = 0;
      spans.length = 0;
      tags = [];
      stack.length = 0;
    }
  };
}
