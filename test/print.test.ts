import { test } from "node:test";
import assert from "node:assert/strict";
import { cancelledPrint, PAGE_MARGIN_CSS, paperFor, PRINT_MAX_CHARS, printFromPage, printOptions, printRequest, withPageMargin, type PrintOptions } from "../src/print";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";

const html = "<!doctype html><html><head><title>Plan</title></head><body>Text</body></html>";

test("a print request is checked: HTML as a string within the limit, title and paper (#424)", () => {
  assert.deepEqual(printRequest({ html, title: "Plan\n— Flowplan", paper: "a4" }), { ok: true, request: { html, title: "Plan — Flowplan", paper: "a4" } });
  assert.deepEqual(printRequest({ html, paper: "legal" }), { ok: true, request: { html, title: "", paper: null } });
  assert.equal(printRequest({ html, title: "x".repeat(500) }).ok && (printRequest({ html, title: "x".repeat(500) }) as { request: { title: string } }).request.title.length, 200);
  for (const bad of [undefined, null, 42, "", "   ", { html }])
    assert.deepEqual(printRequest({ html: bad, title: "t" }), { ok: false, reason: "invalid" });
  assert.equal(PRINT_MAX_CHARS, 25 * 1024 * 1024);
  assert.equal(printRequest({ html: "x".repeat(PRINT_MAX_CHARS) }).ok, true);
  assert.deepEqual(printRequest({ html: "x".repeat(PRINT_MAX_CHARS + 1) }), { ok: false, reason: "tooLarge" });
});

test("paper: as the page chose it, else Letter in the Americas that use it and A4 elsewhere", () => {
  assert.equal(paperFor("letter", "DE"), "letter");
  assert.equal(paperFor("a4", "US"), "a4");
  assert.equal(paperFor(null, "US"), "letter");
  assert.equal(paperFor(null, "ca"), "letter");
  assert.equal(paperFor(null, "DE"), "a4");
  assert.equal(paperFor(null, undefined), "a4");
});

test("Android gets a page margin by CSS before the document's own, iOS as an option", () => {
  const android = printOptions({ html, title: "", paper: "a4" }, "android", "DE");
  assert.equal(android.width, 595);
  assert.equal(android.height, 842);
  assert.equal(android.margins, undefined);
  assert.ok(android.html.startsWith(`<!doctype html><html><head><style data-app-print>${PAGE_MARGIN_CSS}</style><title>`));
  const ios = printOptions({ html, title: "", paper: null }, "ios", "US");
  assert.equal(ios.html, html);
  assert.deepEqual([ios.width, ios.height], [612, 792]);
  assert.ok(ios.margins && ios.margins.top > 0);
  assert.equal(withPageMargin("<p>x</p>"), `<style data-app-print>${PAGE_MARGIN_CSS}</style><p>x</p>`);
  assert.ok(withPageMargin('<html><head lang="de"><meta charset="utf-8">').startsWith(`<html><head lang="de"><style data-app-print>`));
});

test("printing: the dialog opens, a cancelled one is no error, failures and refusals are said", async () => {
  const alerts: string[] = [];
  const printed: PrintOptions[] = [];
  const env = (print: (options: PrintOptions) => Promise<void>) => ({ platform: "android", region: "DE", print, alert: (title: string, message: string) => void alerts.push(`${title}: ${message}`) });
  assert.equal(await printFromPage({ type: "print", html, paper: null } as never, env(async (o) => void printed.push(o))), "printed");
  assert.equal(printed.length, 1);
  assert.equal(alerts.length, 0);
  const cancel = Object.assign(new Error("Printing did not complete"), { code: "ERR_PRINT_INCOMPLETE" });
  assert.equal(cancelledPrint(cancel), true);
  assert.equal(cancelledPrint(new Error("boom")), false);
  assert.equal(cancelledPrint(null), false);
  assert.equal(await printFromPage({ html }, env(() => Promise.reject(cancel))), "cancelled");
  assert.equal(alerts.length, 0);
  assert.equal(await printFromPage({ html }, env(() => Promise.reject(new Error("no print manager")))), "failed");
  assert.equal(alerts.length, 1);
  // Never printed: too large, or not a document.
  const calls: unknown[] = [];
  assert.equal(await printFromPage({ html: "x".repeat(PRINT_MAX_CHARS + 1) }, env(async (o) => void calls.push(o))), "refused");
  assert.equal(await printFromPage({ html: 5 }, env(async (o) => void calls.push(o))), "refused");
  assert.equal(calls.length, 0);
  assert.equal(alerts.length, 3);
  assert.match(alerts[1], /25 MB/);
});

test("the bridge offers print on both platforms and sends only strings and a known paper", () => {
  for (const platform of ["ios", "android"] as const) {
    const script = bridgeScript({ server: "https://plan.example", platform, version: "1.2.0" });
    const posted: string[] = [];
    const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (m: string) => posted.push(m) } };
    window.top = window;
    const run = new Function("window", "location", "navigator", "document", "addEventListener", "getComputedStyle", "innerWidth", "innerHeight", "requestAnimationFrame", "MutationObserver", `with (window) { ${script} }`);
    try {
      run(window, { origin: "https://plan.example", pathname: "/", search: "", hash: "" }, {}, { documentElement: null, readyState: "loading", addEventListener() {} }, () => {}, () => ({}), 400, 800, () => 0, class { observe() {} });
    } catch {}
    const app = window.FlowplanApp as { print?: (request: unknown) => void } | undefined;
    assert.equal(typeof app?.print, "function", platform);
    app!.print!({ html, title: "Plan", paper: "letter" });
    app!.print!({ html: 5, title: {}, paper: "legal" });
    const [good, bad] = posted.filter((m) => m.includes('"print"')).map((m) => parsePageMessage(m));
    assert.deepEqual(good, { type: "print", html, title: "Plan", paper: "letter" });
    assert.deepEqual(bad, { type: "print", html: "", title: "", paper: null });
  }
});
