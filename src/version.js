// The build number is ((major·100 + minor)·100 + patch)·100 + build, so it
// grows with every version; FLOWPLAN_BUILD (0–99) counts uploads of the same
// version (rebuilds), e.g. 1.2.3 → 1020300, its first rebuild 1020301. iOS
// (CFBundleVersion) and Android (versionCode) both use it. Plain JavaScript:
// app.config.ts loads it while generating the native projects.

/**
 * @param {string} version major.minor.patch
 * @param {string | number | undefined} [build] 0–99
 * @returns {number}
 */
function buildNumber(version, build = 0) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`package.json: version ${version} is not major.minor.patch`);
  const [major, minor, patch] = match.slice(1).map(Number);
  const extra = Number(build || 0);
  if (!Number.isInteger(extra) || extra < 0 || extra > 99) throw new Error("FLOWPLAN_BUILD must be 0–99");
  if (minor > 99 || patch > 99) throw new Error("minor and patch must stay below 100");
  return ((major * 100 + minor) * 100 + patch) * 100 + extra;
}

module.exports = { buildNumber };
