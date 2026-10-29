// GitHub releases for the workflows (release.yml, build.yml) through the REST
// API, so the build Mac needs no GitHub CLI – only Node and GH_TOKEN.
//   node scripts/github-release.mjs ensure  v1.2.3 "Flowplan Mobile 1.2.3"
//   node scripts/github-release.mjs upload  v1.2.3 out/*
//   node scripts/github-release.mjs publish v1.2.3
// Drafts have no tag yet as far as GitHub's lookup by tag is concerned, so
// the release is found in the list (which includes drafts for the token).
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [command, tag, ...rest] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
if (!command || !tag || !repo || !token) {
  console.error("usage: github-release.mjs ensure|upload|publish <tag> … (GITHUB_REPOSITORY and GH_TOKEN set)");
  process.exit(2);
}
const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };

async function call(method, url, body, extra = {}) {
  const response = await fetch(url.startsWith("http") ? url : `${api}${url}`, {
    method,
    headers: { ...headers, ...(body && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...extra },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function find() {
  for (let page = 1; page <= 10; page++) {
    const list = await call("GET", `/repos/${repo}/releases?per_page=100&page=${page}`);
    const hit = list.find((release) => release.tag_name === tag);
    if (hit || list.length < 100) return hit || null;
  }
  return null;
}

if (command === "ensure") {
  const existing = await find();
  if (existing) console.log(`${tag}: release ${existing.id} is there${existing.draft ? " (draft)" : ""}`);
  else {
    const created = await call("POST", `/repos/${repo}/releases`, { tag_name: tag, name: rest[0] || tag, draft: true, generate_release_notes: true });
    console.log(`${tag}: draft release ${created.id} created`);
  }
} else if (command === "upload") {
  const release = await find();
  if (!release) throw new Error(`${tag}: no release to attach to`);
  for (const file of rest) {
    const name = basename(file);
    // --clobber: a file of the same name from an earlier attempt goes first.
    for (const old of release.assets.filter((asset) => asset.name === name)) await call("DELETE", `/repos/${repo}/releases/assets/${old.id}`);
    const upload = release.upload_url.replace(/\{.*$/, "");
    const bytes = new Uint8Array(readFileSync(file));
    await call("POST", `${upload}?name=${encodeURIComponent(name)}`, bytes, { "content-type": "application/octet-stream"});
    console.log(`${tag}: ${name} attached`);
  }
} else if (command === "publish") {
  const release = await find();
  if (!release) throw new Error(`${tag}: no release to publish`);
  await call("PATCH", `/repos/${repo}/releases/${release.id}`, { draft: false, make_latest: "true" });
  console.log(`${tag}: published as the latest release`);
} else {
  console.error(`unknown command ${command}`);
  process.exit(2);
}
