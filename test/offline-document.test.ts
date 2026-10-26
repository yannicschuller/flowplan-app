import { test } from "node:test";
import assert from "node:assert/strict";
import { attributes, inlineCss, metaPolicy, offlineDocument, staticPath, utf8, type Lookup } from "../src/offline/document";
import { bridgeScript } from "../src/bridge-script";
import { answerScript } from "../src/offline/loader";

const NONCE = "NWRiMzFmY2EtNDUz";
const POLICY = `default-src 'self'; script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; upgrade-insecure-requests`;
// The app's page as Next.js 16 (Turbopack) writes it, shortened.
const PAGE = `<!DOCTYPE html><html lang="de"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><link rel="stylesheet" href="/_next/static/chunks/0di51li1lhids.css" nonce="${NONCE}" data-precedence="next"/><link rel="preload" as="script" fetchPriority="low" nonce="${NONCE}" href="/_next/static/chunks/0o_iu04f6t0e7.js"/><script src="/_next/static/chunks/03rh-6nyxp5sq.js" async="" nonce="${NONCE}"></script><script src="/_next/static/chunks/turbopack-2c3mg3r-05n1w.js" async="" nonce="${NONCE}"></script><script src="/_next/static/chunks/0cz1d0mv5g_q7.js" noModule="" nonce="${NONCE}"></script><link rel="preload" href="/fonts.css" as="style"/><link rel="manifest" href="/manifest.webmanifest"/><link rel="icon" href="/icon.svg" type="image/svg+xml"/><link rel="stylesheet" href="/fonts.css"/></head><body><div hidden=""><!--$--><!--/$--></div><script nonce="${NONCE}">(self.__next_f=self.__next_f||[]).push([0])</script><script src="/_next/static/chunks/0o_iu04f6t0e7.js" nonce="${NONCE}" async=""></script></body></html>`;

const files: Record<string, { text: string; type: string }> = {
  "/_next/static/chunks/0di51li1lhids.css": { text: '.a{background:url("data:image/svg+xml,%3Csvg%3E")}.k{src:url(../media/KaTeX.woff2) format("woff2"),url(../media/KaTeX.woff) format("woff")}', type: "text/css; charset=utf-8" },
  "/_next/static/media/KaTeX.woff2": { text: "W2", type: "font/woff2" },
  "/_next/static/chunks/03rh-6nyxp5sq.js": { text: "a()", type: "text/javascript" },
  "/_next/static/chunks/turbopack-2c3mg3r-05n1w.js": { text: "t()", type: "text/javascript" },
  "/_next/static/chunks/0o_iu04f6t0e7.js": { text: "o()", type: "text/javascript" },
  "/fonts.css": { text: '@font-face{src:url("/fonts/sans.woff2") format("woff2")}', type: "text/css" },
  "/fonts/sans.woff2": { text: "S2", type: "" },
};
const lookup =
  (from = files): Lookup =>
  async (path) =>
    from[path] ? { body: Buffer.from(from[path].text).toString("base64"), type: from[path].type } : null;

test("the stored page runs from the copy: placeholders, inline styles, the policy as a meta", async () => {
  const built = await offlineDocument(PAGE, POLICY, lookup());
  assert.ok(built);
  const html = built!.html;
  assert.deepEqual(built!.scripts, ["/_next/static/chunks/03rh-6nyxp5sq.js", "/_next/static/chunks/turbopack-2c3mg3r-05n1w.js", "/_next/static/chunks/0o_iu04f6t0e7.js"]);
  assert.deepEqual(built!.styles, ["/_next/static/chunks/0di51li1lhids.css", "/fonts.css"]);
  // No script, style sheet or preload is fetched from the network – and
  // every tag React rendered is still there (it hydrates against them).
  assert.doesNotMatch(html, /<script[^>]*\ssrc=/);
  assert.doesNotMatch(html, /<link[^>]*\shref=/);
  assert.equal((html.match(/<link /g) || []).length, (PAGE.match(/<link /g) || []).length);
  assert.equal((html.match(/<script/g) || []).length, (PAGE.match(/<script/g) || []).length);
  assert.match(html, new RegExp(`<script data-flowplan-src="/_next/static/chunks/turbopack-2c3mg3r-05n1w.js" nonce="${NONCE}"></script>`));
  assert.match(html, new RegExp(`<script noModule="" nonce="${NONCE}"></script>`));
  assert.match(html, /<link rel="manifest" data-flowplan-href="\/manifest.webmanifest"\/>/);
  // Fonts inline as data:, other references kept, the cascade's order too.
  assert.match(html, /<link rel="stylesheet" data-flowplan-href="\/_next\/static\/chunks\/0di51li1lhids.css" nonce="[^"]+" data-precedence="next"\/><style data-flowplan-href="\/_next\/static\/chunks\/0di51li1lhids.css" nonce="[^"]+">/);
  assert.match(html, /url\("data:font\/woff2;base64,VzI="\) format\("woff2"\)/);
  assert.match(html, /url\("\/_next\/static\/media\/KaTeX.woff"\)/);
  assert.match(html, /url\("data:image\/svg\+xml,%3Csvg%3E"\)/);
  assert.match(html, /url\("data:font\/woff2;base64,UzI="\)/);
  assert.ok(html.indexOf("0di51li1lhids.css") < html.indexOf('data-flowplan-href="/fonts.css"'));
  // Inline scripts of the page stay as they are.
  assert.match(html, /<script nonce="[^"]+">\(self.__next_f=self.__next_f\|\|\[\]\).push\(\[0\]\)<\/script>/);
  // The copy names itself and carries the policy, first in <head>.
  const head = html.slice(html.indexOf("<head>"), html.indexOf("<link") > 0 ? html.indexOf("<link") : html.indexOf("<style"));
  assert.match(head, /^<head><meta charSet="utf-8"\/><meta name="flowplan-offline-copy" content="1"><meta http-equiv="Content-Security-Policy" content="[^"]+">/);
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<style"));
  const meta = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)![1].replace(/&#39;|&#x27;/g, "'");
  assert.match(meta, /script-src 'self' 'nonce-NWRiMzFmY2EtNDUz' 'strict-dynamic' 'wasm-unsafe-eval' blob:/);
  assert.match(meta, /style-src 'self' 'unsafe-inline'(;|$)/);
  assert.doesNotMatch(meta, /frame-ancestors/);
});

test("no stored page that cannot work", async () => {
  const missing = { ...files };
  delete missing["/_next/static/chunks/turbopack-2c3mg3r-05n1w.js"];
  assert.equal(await offlineDocument(PAGE, POLICY, lookup(missing)), null);
  assert.equal(await offlineDocument(PAGE.replace("<body>", '<body data-signed-out="">'), POLICY, lookup()), null);
  assert.equal(await offlineDocument("not html", POLICY, lookup()), null);
  // A style sheet the copy lacks stays inert; without a policy no meta.
  const noFonts = { ...files };
  delete noFonts["/fonts.css"];
  const built = await offlineDocument(PAGE, null, lookup(noFonts));
  assert.ok(built && !built.html.includes("Content-Security-Policy") && !/\shref="\/fonts.css"/.test(built.html) && !built.html.includes('<style data-flowplan-href="/fonts.css"'));
});

test("the pieces: attributes, paths, the policy, style sheets, UTF-8", async () => {
  assert.deepEqual(
    [...attributes('<link rel="stylesheet" href="/a.css?x=1&amp;y=2" data-precedence=next disabled>')],
    [
      ["rel", "stylesheet"],
      ["href", "/a.css?x=1&y=2"],
      ["data-precedence", "next"],
      ["disabled", ""],
    ],
  );
  assert.equal(staticPath("/_next/static/chunks/a.js?dpl=1"), "/_next/static/chunks/a.js?dpl=1");
  assert.equal(staticPath("https://flowplan.invalid/fonts/x.woff2"), "/fonts/x.woff2");
  for (const other of ["https://cdn.example/_next/static/a.js", "/api/files/x", "/sw.js", "//evil/_next/static/a.js", undefined]) assert.equal(staticPath(other), null, String(other));
  assert.equal(metaPolicy(null), null);
  assert.equal(metaPolicy("frame-ancestors 'none'; report-uri /r"), null);
  assert.equal(metaPolicy("script-src 'self' blob:"), "script-src 'self' blob:");
  assert.equal(await inlineCss("a{b:url(x.png)}", "/_next/static/chunks/a.css", async () => null), 'a{b:url("/_next/static/chunks/x.png")}');
  assert.equal(await inlineCss("a{b:url(#f)}", "/a.css", async () => null), "a{b:url(#f)}");
  assert.equal(utf8(Buffer.from("Grüße – 😀").toString("base64")), "Grüße – 😀");
});

test("the bridge offers the copy on iOS only when asked, and stays valid script", () => {
  const plain = bridgeScript({ server: "https://flowplan.example", platform: "ios", version: "1" });
  const offline = bridgeScript({ server: "https://flowplan.example", platform: "ios", version: "1", offline: true });
  assert.doesNotMatch(plain, /FlowplanApp\.offline|offlineCall/);
  assert.match(offline, /\n    offline,\n/);
  for (const script of [plain, offline]) assert.doesNotThrow(() => new Function(script));
  // Answers are one event with the call's id.
  const answer = answerScript(7, { ok: true, value: { body: "</script> " } });
  assert.doesNotThrow(() => new Function(answer));
  assert.match(answer, /"id":7/);
});
