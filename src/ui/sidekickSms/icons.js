/**
 * Pixel-style inline SVGs for Danger OS / Sidekick 3 SMS UI.
 * Drawn on a crisp 1px grid — keep viewBoxes small and integer.
 */

function svg(viewBox, body, attrs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true" ${attrs}>${body}</svg>`;
}

/** Tiny Sidekick / phone glyph used in headers. */
export function iconDevice(fill = "#fff") {
  return svg(
    "0 0 12 14",
    `<rect x="2" y="1" width="8" height="12" rx="1.5" fill="none" stroke="${fill}" stroke-width="1.2"/>
     <rect x="4" y="3" width="4" height="5" fill="${fill}"/>
     <rect x="5" y="10" width="2" height="1.5" rx="0.5" fill="${fill}"/>`
  );
}

export function iconSignal(fill = "#3a8fd4") {
  return svg(
    "0 0 16 12",
    `<rect x="1" y="9" width="2" height="3" fill="${fill}"/>
     <rect x="5" y="6" width="2" height="6" fill="${fill}"/>
     <rect x="9" y="3" width="2" height="9" fill="${fill}"/>
     <rect x="13" y="0" width="2" height="12" fill="${fill}"/>`
  );
}

export function iconBattery(fill = "#3a8fd4", tip = "#3a8fd4") {
  return svg(
    "0 0 18 10",
    `<rect x="1" y="1" width="14" height="8" rx="1" fill="none" stroke="${fill}" stroke-width="1.2"/>
     <rect x="3" y="3" width="7" height="4" fill="${fill}"/>
     <rect x="15" y="3" width="2" height="4" fill="${tip}"/>`
  );
}

export function iconNetwork3G(fill = "#3a8fd4") {
  return svg(
    "0 0 16 12",
    `<text x="0" y="10" font-family="Tahoma,sans-serif" font-size="10" font-weight="700" fill="${fill}">3G</text>`
  );
}

export function iconSim(fill = "#fff") {
  return svg(
    "0 0 10 12",
    `<path d="M1 3 L3 1 H9 V11 H1 Z" fill="none" stroke="${fill}" stroke-width="1"/>
     <rect x="3" y="4" width="4" height="3" fill="${fill}"/>`
  );
}

export function iconStorage(fill = "#fff") {
  return svg(
    "0 0 12 10",
    `<rect x="1" y="2" width="10" height="7" rx="1" fill="none" stroke="${fill}" stroke-width="1"/>
     <rect x="3" y="4" width="2" height="3" fill="${fill}"/>
     <rect x="6" y="4" width="2" height="3" fill="${fill}"/>
     <rect x="9" y="0" width="1.5" height="2" fill="${fill}"/>`
  );
}

export function iconDocs(fill = "#333") {
  return svg(
    "0 0 12 14",
    `<rect x="2" y="1" width="8" height="11" fill="none" stroke="${fill}" stroke-width="1.2"/>
     <rect x="4" y="3" width="4" height="1" fill="${fill}"/>
     <rect x="4" y="5" width="4" height="1" fill="${fill}"/>
     <rect x="4" y="7" width="3" height="1" fill="${fill}"/>`
  );
}

export function iconMenu(fill = "#333") {
  return svg(
    "0 0 12 10",
    `<rect x="1" y="1" width="10" height="1.5" fill="${fill}"/>
     <rect x="1" y="4.25" width="10" height="1.5" fill="${fill}"/>
     <rect x="1" y="7.5" width="10" height="1.5" fill="${fill}"/>`
  );
}

export function iconKeyM(fill = "#1a5fb4") {
  return svg(
    "0 0 14 14",
    `<rect x="1" y="1" width="12" height="12" rx="1" fill="${fill}"/>
     <text x="7" y="11" text-anchor="middle" font-family="Tahoma,sans-serif" font-size="10" font-weight="700" fill="#fff">M</text>`
  );
}

export function iconLock(fill = "#fff") {
  return svg(
    "0 0 10 12",
    `<rect x="2" y="5" width="6" height="5" rx="0.5" fill="${fill}"/>
     <path d="M3 5 V3.5 A2 2 0 0 1 7 3.5 V5" fill="none" stroke="${fill}" stroke-width="1.2"/>`
  );
}
