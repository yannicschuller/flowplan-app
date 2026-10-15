// Writes the version from package.json into the native projects:
//   iOS      MARKETING_VERSION / CURRENT_PROJECT_VERSION (project.pbxproj)
//   Android  versionName / versionCode (android/app/build.gradle)
// The build number is ((major·100 + minor)·100 + patch)·100 + build, so it
// grows with every version; FLOWPLAN_BUILD (0–99) counts uploads of the same
// version (rebuilds), e.g. 1.2.3 → 1020300, its first rebuild 1020301.
//   node scripts/version.mjs            (npm version runs it by itself)
//   node scripts/version.mjs --print    prints "1.2.3 1020300"
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) throw new Error(`package.json: version ${version} is not major.minor.patch`);
const [major, minor, patch] = match.slice(1).map(Number);
const build = Number(process.env.FLOWPLAN_BUILD || 0);
if (!Number.isInteger(build) || build < 0 || build > 99) throw new Error("FLOWPLAN_BUILD must be 0–99");
if (minor > 99 || patch > 99) throw new Error("minor and patch must stay below 100");
const code = ((major * 100 + minor) * 100 + patch) * 100 + build;

if (process.argv.includes("--print")) {
  console.log(`${version} ${code}`);
  process.exit(0);
}

function update(file, replacements) {
  const path = `${root}${file}`;
  let text = readFileSync(path, "utf8");
  for (const [pattern, value] of replacements) {
    if (!pattern.test(text)) throw new Error(`${file}: ${pattern} not found`);
    text = text.replace(new RegExp(pattern.source, "g"), value);
  }
  writeFileSync(path, text);
}
update("ios/App/App.xcodeproj/project.pbxproj", [
  [/MARKETING_VERSION = [^;]+;/, `MARKETING_VERSION = ${version};`],
  [/CURRENT_PROJECT_VERSION = [^;]+;/, `CURRENT_PROJECT_VERSION = ${code};`],
]);
update("android/app/build.gradle", [
  [/versionCode \d+/, `versionCode ${code}`],
  [/versionName "[^"]*"/, `versionName "${version}"`],
]);
console.log(`Version ${version} (build ${code})`);
