/** IE 6 chrome drawing for the CRT canvas texture. */

export const IE_CHROME_RATIO = {
  title: 22 / 768,
  menu: 19 / 768,
  toolbar: 26 / 768,
  address: 22 / 768,
  status: 18 / 768
};

const IE = {
  frame: "#ece9d8",
  frameDark: "#808080",
  frameLight: "#ffffff",
  titleTop: "#0054e3",
  titleBottom: "#2b6aef",
  titleText: "#ffffff",
  menuText: "#000000",
  toolBtnFace: "#ece9d8",
  addressLabel: "#000000",
  addressField: "#ffffff",
  urlText: "#000000",
  statusText: "#000000"
};

function drawRaisedRect(ctx, x, y, w, h, fill = IE.toolBtnFace) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = IE.frameLight;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.strokeStyle = IE.frameDark;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

function drawSunkenRect(ctx, x, y, w, h, fill = IE.addressField) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = IE.frameDark;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = IE.frameLight;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

function drawIeLogo(ctx, x, y, size) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.42;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0078d7";
  ctx.fill();
  ctx.strokeStyle = "#004578";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#7ec850";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.15, cy + r * 0.05, r * 0.55, r * 0.35, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffcc00";
  ctx.lineWidth = Math.max(2, size * 0.11);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx + r * 0.08, cy - r * 0.05, r * 0.95, Math.PI * 0.15, Math.PI * 1.35);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(size * 0.52)}px Times New Roman, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("e", cx - size * 0.02, cy + size * 0.06);
}

function drawToolbarIcon(ctx, type, x, y, size, enabled = true) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const color = enabled ? "#1a1a1a" : "#a0a0a0";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  if (type === "back") {
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 5);
    ctx.lineTo(cx - 4, cy);
    ctx.lineTo(cx + 3, cy + 5);
    ctx.stroke();
  } else if (type === "forward") {
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - 5);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx - 3, cy + 5);
    ctx.stroke();
  } else if (type === "stop") {
    ctx.fillRect(cx - 4, cy - 4, 8, 8);
  } else if (type === "refresh") {
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0.6, Math.PI * 2 - 0.4);
    ctx.stroke();
  } else if (type === "home") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 5, cy);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.lineTo(cx + 5, cy);
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(cx - 2, cy + 1, 4, 4);
  } else if (type === "search") {
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy + 2);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.stroke();
  } else if (type === "favorites") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx + 4, cy + 1);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx - 4, cy + 1);
    ctx.closePath();
    ctx.fill();
  } else if (type === "print") {
    ctx.strokeRect(cx - 4, cy - 1, 8, 5);
    ctx.fillRect(cx - 3, cy - 5, 6, 4);
    ctx.strokeRect(cx - 3, cy - 5, 6, 4);
  }
}

/** Shrink the IE window inward so curved CRT bezels do not clip chrome. */
export function insetWindowRect(win, padX, padY) {
  const ix = Math.max(0, Math.round(padX));
  const iy = Math.max(0, Math.round(padY));
  return {
    x: win.x + ix,
    y: win.y + iy,
    w: Math.max(1, win.w - ix * 2),
    h: Math.max(1, win.h - iy * 2)
  };
}

export function buildIeLayout(windowRect) {
  const win = windowRect;
  const ie = {
    titleH: Math.max(14, Math.round(IE_CHROME_RATIO.title * win.h)),
    menuH: Math.max(12, Math.round(IE_CHROME_RATIO.menu * win.h)),
    toolH: Math.max(16, Math.round(IE_CHROME_RATIO.toolbar * win.h)),
    addressH: Math.max(14, Math.round(IE_CHROME_RATIO.address * win.h)),
    statusH: Math.max(12, Math.round(IE_CHROME_RATIO.status * win.h))
  };
  ie.topH = ie.titleH + ie.menuH + ie.toolH + ie.addressH;
  const content = {
    x: win.x,
    y: win.y + ie.topH,
    w: win.w,
    h: Math.max(1, win.h - ie.topH - ie.statusH)
  };
  return { window: win, content, ie };
}

/** @param {CanvasRenderingContext2D} ctx */
export function drawIeChrome(ctx, layout, profileUrl) {
  const { window: win, content, ie } = layout;
  let y = win.y;

  ctx.fillStyle = IE.frame;
  ctx.fillRect(win.x, win.y, win.w, ie.topH + 1);
  ctx.fillRect(win.x, content.y + content.h - 1, win.w, ie.statusH + 1);
  ctx.strokeStyle = IE.frameDark;
  ctx.lineWidth = 1;
  ctx.strokeRect(win.x + 0.5, win.y + 0.5, win.w - 1, win.h - 1);
  ctx.beginPath();
  ctx.moveTo(content.x, content.y);
  ctx.lineTo(content.x + content.w, content.y);
  ctx.moveTo(content.x, content.y + content.h);
  ctx.lineTo(content.x + content.w, content.y + content.h);
  ctx.stroke();

  const titleGrad = ctx.createLinearGradient(0, y, 0, y + ie.titleH);
  titleGrad.addColorStop(0, IE.titleTop);
  titleGrad.addColorStop(1, IE.titleBottom);
  ctx.fillStyle = titleGrad;
  ctx.fillRect(win.x + 2, y + 2, win.w - 4, ie.titleH - 2);

  const iconSize = Math.min(16, ie.titleH - 6);
  drawIeLogo(ctx, win.x + 6, y + (ie.titleH - iconSize) / 2, iconSize);
  ctx.fillStyle = IE.titleText;
  ctx.font = `bold ${Math.max(10, Math.round(ie.titleH * 0.48))}px Tahoma, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("MySpace.com - Microsoft Internet Explorer", win.x + 6 + iconSize + 6, y + ie.titleH / 2);

  const btnW = Math.max(18, Math.round(ie.titleH * 1.05));
  const btnH = ie.titleH - 4;
  const btnY = y + 2;
  let btnX = win.x + win.w - btnW * 3 - 4;
  ["_", "□", "×"].forEach((label) => {
    drawRaisedRect(ctx, btnX, btnY, btnW, btnH, IE.frame);
    ctx.fillStyle = "#000000";
    ctx.font = `${label === "×" ? "bold " : ""}${Math.round(btnH * 0.55)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, btnX + btnW / 2, btnY + btnH / 2 + (label === "_" ? 2 : 0));
    btnX += btnW + 1;
  });

  y += ie.titleH;
  ctx.fillStyle = IE.frame;
  ctx.fillRect(win.x + 2, y, win.w - 4, ie.menuH);
  ctx.fillStyle = IE.menuText;
  ctx.font = `${Math.max(10, Math.round(ie.menuH * 0.58))}px Tahoma, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  let menuX = win.x + 8;
  ["File", "Edit", "View", "Favorites", "Tools", "Help"].forEach((item) => {
    ctx.fillText(item, menuX, y + ie.menuH / 2);
    menuX += ctx.measureText(item).width + 16;
  });

  y += ie.menuH;
  ctx.fillRect(win.x + 2, y, win.w - 4, ie.toolH);
  const toolBtnH = ie.toolH - 6;
  const toolBtnW = toolBtnH + 2;
  let toolX = win.x + 4;
  const toolY = y + 3;
  [
    ["back", true],
    ["forward", false],
    ["stop", true],
    ["refresh", true],
    ["home", true],
    ["search", true],
    ["favorites", true],
    ["print", true]
  ].forEach(([type, enabled], index) => {
    if (index === 2 || index === 5) {
      toolX += 4;
      ctx.strokeStyle = IE.frameDark;
      ctx.beginPath();
      ctx.moveTo(toolX, toolY + 2);
      ctx.lineTo(toolX, toolY + toolBtnH - 2);
      ctx.stroke();
      toolX += 4;
    }
    drawRaisedRect(ctx, toolX, toolY, toolBtnW, toolBtnH);
    drawToolbarIcon(ctx, type, toolX + 1, toolY + 1, toolBtnW - 2, enabled);
    toolX += toolBtnW + 2;
  });

  y += ie.toolH;
  ctx.fillRect(win.x + 2, y, win.w - 4, ie.addressH);
  ctx.fillStyle = IE.addressLabel;
  ctx.font = `${Math.max(10, Math.round(ie.addressH * 0.5))}px Tahoma, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("Address", win.x + 8, y + ie.addressH / 2 + 1);

  const logoSize = Math.min(22, ie.addressH - 4);
  const logoX = win.x + win.w - logoSize - 6;
  const fieldX = win.x + 68;
  const fieldW = logoX - fieldX - 28;
  const fieldH = ie.addressH - 6;
  const fieldY = y + 3;
  drawSunkenRect(ctx, fieldX, fieldY, fieldW, fieldH);
  ctx.fillStyle = IE.urlText;
  ctx.font = `${Math.max(10, Math.round(ie.addressH * 0.52))}px Arial, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(`http://www.${profileUrl}/`, fieldX + 5, fieldY + fieldH / 2);

  const goW = 22;
  const goX = logoX - goW - 4;
  drawRaisedRect(ctx, goX, fieldY, goW, fieldH);
  ctx.fillStyle = "#006600";
  ctx.font = `bold ${Math.max(11, Math.round(fieldH * 0.55))}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("→", goX + goW / 2, fieldY + fieldH / 2);
  drawIeLogo(ctx, logoX, y + (ie.addressH - logoSize) / 2, logoSize);

  const statusY = content.y + content.h;
  ctx.fillStyle = IE.frame;
  ctx.fillRect(win.x + 2, statusY, win.w - 4, ie.statusH);
  ctx.strokeStyle = IE.frameDark;
  ctx.beginPath();
  ctx.moveTo(win.x + 2, statusY);
  ctx.lineTo(win.x + win.w - 2, statusY);
  ctx.stroke();
  ctx.fillStyle = IE.statusText;
  ctx.font = `${Math.max(9, Math.round(ie.statusH * 0.52))}px Tahoma, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("Done", win.x + 8, statusY + ie.statusH / 2);
  ctx.textAlign = "right";
  ctx.fillText("Internet", win.x + win.w - 28, statusY + ie.statusH / 2);
  ctx.strokeRect(win.x + win.w - 24, statusY + 3, 18, ie.statusH - 6);
  ctx.fillStyle = "#0078d7";
  ctx.fillRect(win.x + win.w - 22, statusY + 5, 14, ie.statusH - 10);
}
