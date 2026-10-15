// Pieces of a device screen for store images and the preview video: the
// status bar and home indicator the app paints in the page's edge colours,
// the page between them, and a device frame around it.
import { readFileSync } from "node:fs";

export const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
export const luminance = (rgb) => {
  const [r, g, b] = (rgb.match(/\d+/g) || [252, 251, 248]).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function statusBar(device, color, scale) {
  const ink = luminance(color) < 128 ? "#fff" : "#000";
  const s = (v) => `${v * scale}px`;
  if (device.platform === "ios") {
    const island = device.tablet
      ? ""
      : `<div style="position:absolute;left:50%;top:${s(11)};width:${s(124)};height:${s(36)};margin-left:${s(-62)};background:#000;border-radius:${s(20)}"></div>`;
    const y = device.tablet ? 4 : device.top >= 60 ? 21 : 14;
    return `<div style="position:absolute;inset:0 0 auto 0;height:${s(device.top)};background:${color};color:${ink}">
      ${island}
      <div style="position:absolute;left:${s(device.tablet ? 22 : 36)};top:${s(y)};font:600 ${s(device.tablet ? 13 : 17)}/1 -apple-system,system-ui,sans-serif">9:41</div>
      <svg style="position:absolute;right:${s(device.tablet ? 20 : 30)};top:${s(y + 2)}" width="${s(72)}" height="${s(13)}" viewBox="0 0 72 13" fill="${ink}">
        <rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/>
        <path d="M31 3.2a9.6 9.6 0 0 1 12.8 0l-1.4 1.5a7.6 7.6 0 0 0-10 0Zm2.8 3a5.6 5.6 0 0 1 7.2 0l-1.4 1.5a3.6 3.6 0 0 0-4.4 0Zm3.6 2.6 1.6 1.7-1.6 1.6-1.6-1.6Z"/>
        <rect x="47.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="${ink}" opacity=".4"/><rect x="49.5" y="2.5" width="17" height="7" rx="1.5"/><rect x="69.5" y="4" width="1.5" height="4" rx=".7" opacity=".4"/>
      </svg></div>`;
  }
  return `<div style="position:absolute;inset:0 0 auto 0;height:${s(device.top)};background:${color};color:${ink}">
    <div style="position:absolute;left:${s(16)};top:${s(5)};font:500 ${s(13)}/1 Roboto,system-ui,sans-serif">9:41</div>
    ${device.tablet ? "" : `<div style="position:absolute;left:50%;top:${s(5)};width:${s(13)};height:${s(13)};margin-left:${s(-6.5)};background:#000;border-radius:50%"></div>`}
    <svg style="position:absolute;right:${s(14)};top:${s(5)}" width="${s(46)}" height="${s(13)}" viewBox="0 0 46 13" fill="${ink}">
      <path d="M0 12 12 0v12Z"/><path d="M17 3.4a10 10 0 0 1 14 0L24 12Z"/><rect x="36" y="1" width="8" height="12" rx="1.5"/><rect x="38" y="0" width="4" height="1.5"/>
    </svg></div>`;
}

export function homeIndicator(device, color, scale) {
  const ink = luminance(color) < 128 ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.85)";
  const s = (v) => `${v * scale}px`;
  const width = device.platform === "ios" ? (device.tablet ? 315 : 140) : 108;
  return `<div style="position:absolute;inset:auto 0 0 0;height:${s(device.bottom)};background:${color}">
    <div style="position:absolute;left:50%;bottom:${s(8)};width:${s(width)};height:${s(device.platform === "ios" ? 5 : 4)};margin-left:${s(-width / 2)};background:${ink};border-radius:${s(3)}"></div></div>`;
}

// The screen: status bar, page, home indicator – what the app shows.
export function screen(device, shot, meta, screenWidth) {
  const scale = screenWidth / device.width;
  const height = device.height * scale;
  return `<div style="position:relative;width:${screenWidth}px;height:${height}px;overflow:hidden;background:${meta.top}">
    ${statusBar(device, meta.top, scale)}
    <img src="${dataUrl(shot)}" style="position:absolute;left:0;top:${device.top * scale}px;width:${screenWidth}px;height:${(device.height - device.top - device.bottom) * scale}px">
    ${homeIndicator(device, meta.bottom, scale)}
  </div>`;
}

export function frame(device, inner, screenWidth) {
  const bezel = Math.round(screenWidth * (device.tablet ? 0.028 : 0.04));
  const radius = Math.round(screenWidth * (device.tablet ? 0.045 : device.platform === "ios" ? 0.135 : 0.1));
  return `<div style="padding:${bezel}px;background:#0f0f14;border-radius:${radius + bezel}px;box-shadow:0 ${bezel * 2}px ${bezel * 6}px rgba(20,10,60,.45), inset 0 0 0 ${Math.max(2, bezel / 6)}px #2c2b35">
    <div style="border-radius:${radius}px;overflow:hidden">${inner}</div></div>`;
}
