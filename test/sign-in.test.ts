import { test } from "node:test";
import assert from "node:assert/strict";
import { openSignIn } from "../src/sign-in";

// #109: on Android the sign-in opens in a Custom Tab (the result comes as an
// app link), else in the default browser; failures are reported, not swallowed.
test("openSignIn: iOS uses the auth session and hands its result back", async () => {
  const calls: string[] = [];
  const out = await openSignIn("https://x/api/auth/desktop", {
    platform: "ios",
    authSession: async (_url, redirect) => (calls.push(`session ${redirect}`), { type: "success", url: "flowplan://sign-in?code=1" }),
    customTab: async () => calls.push("tab"),
    browser: async () => calls.push("browser"),
  });
  assert.deepEqual(out, { opened: true, link: "flowplan://sign-in?code=1" });
  assert.deepEqual(calls, ["session flowplan://sign-in"]);
});

test("openSignIn: Android opens a Custom Tab, falls back to the browser, and reports when nothing opens", async () => {
  const calls: string[] = [];
  const ok = await openSignIn("https://x/a", {
    platform: "android",
    authSession: async () => (calls.push("session"), { type: "dismiss" }),
    customTab: async () => calls.push("tab"),
    browser: async () => calls.push("browser"),
  });
  assert.deepEqual(ok, { opened: true, link: null });
  assert.deepEqual(calls, ["tab"], "never the auth-session stand-in on Android");
  const fallback = await openSignIn("https://x/a", {
    platform: "android",
    authSession: async () => ({ type: "dismiss" }),
    customTab: async () => {
      throw new Error("No matching browser activity found");
    },
    browser: async () => calls.push("browser"),
  });
  assert.deepEqual(fallback, { opened: true, link: null });
  assert.equal(calls.at(-1), "browser");
  const none = await openSignIn("https://x/a", {
    platform: "android",
    authSession: async () => ({ type: "dismiss" }),
    customTab: async () => {
      throw new Error("no tab");
    },
    browser: async () => {
      throw new Error("no browser");
    },
  });
  assert.deepEqual(none, { opened: false, error: "no tab; no browser" });
});
