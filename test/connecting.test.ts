import { test } from "node:test";
import assert from "node:assert/strict";
import { ANDROID_GRACE_MS, connectStep, LOAD_LIMIT_MS, nextTick, PROBE_TIMEOUT_MS, retryDelay, startConnect, type Connect, type ConnectEvent } from "../src/connecting";
import { instanceAnswers } from "../src/server";

const run = (platform: string, events: ConnectEvent[], start = 1000): Connect => events.reduce((state, event) => connectStep(state, event, platform), startConnect(start));

test("#203: the page loading ends 'Connecting' – before or after the health check", () => {
  assert.equal(run("ios", [{ type: "settled" }]).phase, "done");
  assert.equal(run("ios", [{ type: "probe", answered: true, at: 1500 }, { type: "settled" }]).phase, "done");
  assert.equal(run("android", [{ type: "settled" }, { type: "tick", at: 1_000_000 }]).phase, "done");
});

test("#203: an instance that never answers (a hanging connection) gives way after the timeout, not after minutes", () => {
  const ios = startConnect(1000);
  assert.equal(nextTick(ios), 1000 + PROBE_TIMEOUT_MS);
  // Before the timeout: still connecting.
  assert.equal(connectStep(ios, { type: "tick", at: 1000 + PROBE_TIMEOUT_MS - 1 }, "ios").phase, "connecting");
  // iPhone and iPad: the copy or the offline screen right at the timeout.
  assert.equal(connectStep(ios, { type: "tick", at: 1000 + PROBE_TIMEOUT_MS }, "ios").phase, "fallback");
  // Android: a little later (the service worker's copy may still come).
  const android = connectStep(ios, { type: "tick", at: 1000 + PROBE_TIMEOUT_MS }, "android");
  assert.equal(android.phase, "connecting");
  assert.equal(android.probe, "failed");
  assert.equal(nextTick(android), 1000 + PROBE_TIMEOUT_MS + ANDROID_GRACE_MS);
  assert.equal(connectStep(android, { type: "tick", at: 1000 + PROBE_TIMEOUT_MS + ANDROID_GRACE_MS }, "android").phase, "fallback");
  // …unless the page arrives first.
  assert.equal(connectStep(android, { type: "settled" }, "android").phase, "done");
});

test("#203: a network error gives way at once on iOS, after the grace on Android", () => {
  assert.equal(run("ios", [{ type: "probe", answered: false, at: 1200 }]).phase, "fallback");
  const android = run("android", [{ type: "probe", answered: false, at: 1200 }]);
  assert.equal(android.phase, "connecting");
  assert.equal(nextTick(android), 1200 + ANDROID_GRACE_MS);
  assert.equal(connectStep(android, { type: "tick", at: 1200 + ANDROID_GRACE_MS - 1 }, "android").phase, "connecting");
  assert.equal(connectStep(android, { type: "tick", at: 1200 + ANDROID_GRACE_MS }, "android").phase, "fallback");
});

test("#203: an instance that answers gets time for its page; only a page that never comes gives way", () => {
  const answered = run("ios", [{ type: "probe", answered: true, at: 1300 }]);
  assert.equal(answered.phase, "connecting");
  // The health check's timeout no longer applies.
  assert.equal(connectStep(answered, { type: "tick", at: 1000 + PROBE_TIMEOUT_MS + 1 }, "ios").phase, "connecting");
  assert.equal(nextTick(answered), 1000 + LOAD_LIMIT_MS);
  assert.equal(connectStep(answered, { type: "tick", at: 1000 + LOAD_LIMIT_MS }, "ios").phase, "fallback");
});

test("#203: late or repeated events change nothing", () => {
  // An answer after the check timed out does not bring "Connecting" back.
  const timedOut = run("android", [{ type: "tick", at: 1000 + PROBE_TIMEOUT_MS }, { type: "probe", answered: true, at: 1000 + PROBE_TIMEOUT_MS + 10 }]);
  assert.equal(timedOut.probe, "failed");
  // Once done or fallen back, the state stays.
  const done = run("ios", [{ type: "settled" }, { type: "probe", answered: false, at: 1100 }, { type: "tick", at: 99_999 }]);
  assert.equal(done.phase, "done");
  const fallback = run("ios", [{ type: "probe", answered: false, at: 1100 }, { type: "settled" }]);
  assert.equal(fallback.phase, "fallback");
  assert.equal(nextTick(done), null);
  assert.equal(nextTick(fallback), null);
});

test("#203: the offline screen keeps trying – soon first, then every half minute", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 50].map(retryDelay), [5000, 10_000, 20_000, 30_000, 30_000, 30_000]);
  assert.equal(retryDelay(-1), 5000);
});

test("#203: the health check answers yes for any HTTP answer, no for an error or a hang", async () => {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const answers = (async (url: string, init?: RequestInit) => {
    asked.push({ url, init });
    return new Response("bad gateway", { status: 502 });
  }) as typeof fetch;
  assert.equal(await instanceAnswers("https://flowplan.example.com", 1000, answers), true);
  assert.equal(asked[0].url, "https://flowplan.example.com/api/health");
  assert.equal(asked[0].init?.credentials, "omit");
  assert.equal(asked[0].init?.cache, "no-store");

  const refused = (async () => {
    throw new TypeError("Network request failed");
  }) as typeof fetch;
  assert.equal(await instanceAnswers("https://flowplan.example.com", 1000, refused), false);

  // A connection that hangs and ignores the abort: "no" when the time is up.
  const hangs = (() => new Promise<Response>(() => {})) as typeof fetch;
  const started = Date.now();
  assert.equal(await instanceAnswers("https://flowplan.example.com", 50, hangs), false);
  assert.ok(Date.now() - started < 1000);

  // One that honours the abort ends the same way.
  const aborts = ((_: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
  assert.equal(await instanceAnswers("https://flowplan.example.com", 50, aborts), false);
});
