import { test } from "node:test";
import assert from "node:assert/strict";
import { errorPageStep, httpErrorOnInstance, probePage, type PageProbe } from "../src/error-page";

// An error page where the instance's page should be (#373): the reverse
// proxy's "404 page not found" after signing out is no dead end.
const server = "https://flowplan.example.com";
const proxy404: PageProbe = { status: 404, flowplan: false, contentType: "text/plain; charset=utf-8" };
const flowplanOk: PageProbe = { status: 200, flowplan: true, contentType: "text/html; charset=utf-8" };
const step = (url: string, status: number, probe: PageProbe, health: boolean, reloadedRecently = false) =>
  errorPageStep({ url, status }, { probe: async () => probe, health: async () => health, reloadedRecently: () => reloadedRecently });

test("only error answers of the instance's own pages are looked at", () => {
  assert.equal(httpErrorOnInstance(`${server}/`, 404, server), true);
  assert.equal(httpErrorOnInstance(`${server}/share/x`, 404, server), true);
  assert.equal(httpErrorOnInstance(`${server}/login`, 503, server), true);
  assert.equal(httpErrorOnInstance(`${server}/`, 200, server), false);
  assert.equal(httpErrorOnInstance(`${server}/`, 302, server), false);
  // Another site (the identity provider) is not the instance.
  assert.equal(httpErrorOnInstance("https://login.example/", 500, server), false);
  assert.equal(httpErrorOnInstance(`${server}/`, Number.NaN, server), false);
  assert.equal(httpErrorOnInstance(`${server}/`, 500, null), false);
});

test("the proxy's page while Flowplan answers: the screen with Try again and Switch profile", async () => {
  // Signed out, the start page came as Traefik's "404 page not found".
  assert.equal(await step(`${server}/`, 404, proxy404, true), "errorPage");
  assert.equal(await step(`${server}/share/x`, 404, proxy404, true), "errorPage");
  assert.equal(await step(`${server}/`, 502, { status: 502, flowplan: false, contentType: "text/html" }, true), "errorPage");
});

test("no Flowplan there: the stored copy or the offline screen", async () => {
  assert.equal(await step(`${server}/`, 404, proxy404, false), "copy");
  assert.equal(await step(`${server}/`, 502, null, false), "copy");
  assert.equal(await step(`${server}/login`, 503, { status: 503, flowplan: false, contentType: "text/html" }, false), "copy");
});

test("Flowplan answers the address fine now: the page loads again, once", async () => {
  assert.equal(await step(`${server}/`, 404, flowplanOk, true), "reload");
  assert.equal(await step(`${server}/`, 404, flowplanOk, true, true), "errorPage");
});

test("Flowplan's own error pages stay, also an older instance's", async () => {
  assert.equal(await step(`${server}/share/x`, 404, { status: 404, flowplan: true, contentType: "text/html" }, true), "stay");
  assert.equal(await step(`${server}/`, 500, { status: 500, flowplan: true, contentType: "text/html" }, true), "stay");
  // Without the build header (instances before it): an HTML page elsewhere than "/".
  assert.equal(await step(`${server}/share/x`, 404, { status: 404, flowplan: false, contentType: "text/html; charset=utf-8" }, true), "stay");
});

test("the probe reads the build header and refuses another site's answer", async () => {
  const answer = (status: number, headers: Record<string, string>, url = `${server}/`) =>
    (async () => ({ status, url, headers: new Headers(headers), text: async () => "x" })) as unknown as typeof fetch;
  assert.deepEqual(await probePage(`${server}/`, answer(200, { "X-Flowplan-Build": "abc", "Content-Type": "text/html" })), { status: 200, flowplan: true, contentType: "text/html" });
  assert.deepEqual(await probePage(`${server}/`, answer(404, { "Content-Type": "text/plain; charset=utf-8" })), proxy404);
  assert.equal((await probePage(`${server}/`, answer(200, { "X-Flowplan-Build": "abc" }, "https://portal.example/login")))?.flowplan, false);
  assert.equal(await probePage(`${server}/`, (async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch), null);
});
