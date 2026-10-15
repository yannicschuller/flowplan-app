// The store devices: screen in points, scale, and the system areas above
// (status bar) and below (home indicator, gesture bar) the page.
export const DEVICES = {
  "iphone-69": { width: 440, height: 956, scale: 3, top: 62, bottom: 34, platform: "ios" },
  "iphone-65": { width: 428, height: 926, scale: 3, top: 47, bottom: 34, platform: "ios" },
  "ipad-13": { width: 1032, height: 1376, scale: 2, top: 24, bottom: 20, platform: "ios", tablet: true },
  "android-phone": { width: 360, height: 640, scale: 3, top: 24, bottom: 24, platform: "android" },
  "android-7": { width: 600, height: 960, scale: 2, top: 24, bottom: 24, platform: "android", tablet: true },
  "android-10": { width: 800, height: 1280, scale: 2, top: 24, bottom: 24, platform: "android", tablet: true },
};
