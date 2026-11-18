import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NetworkFanOut, networkConnected, type NetworkChange } from "../src/network-changes";

test("#353: the native network listener is added once and never removed", () => {
  let native: ((state: NetworkChange) => void) | null = null;
  let subscribed = 0;
  const fanOut = new NetworkFanOut((listener) => {
    subscribed++;
    native = listener;
    return { remove: () => assert.fail("the native listener must stay") };
  });
  const heard: string[] = [];
  const first = fanOut.add(() => heard.push("first"));
  first();
  assert.equal(fanOut.size, 0);
  // The stored page shown a second time: it still hears the network.
  const second = fanOut.add((state) => heard.push(`second ${networkConnected(state)}`));
  const third = fanOut.add(() => {
    throw new Error("a listener that fails");
  });
  native!({ isConnected: true, isInternetReachable: true });
  assert.equal(subscribed, 1);
  assert.deepEqual(heard, ["second true"]);
  second();
  third();
});

test("#353: connected only with a network that may reach the instance", () => {
  assert.equal(networkConnected({ isConnected: true, isInternetReachable: true }), true);
  assert.equal(networkConnected({ isConnected: true, isInternetReachable: null }), true);
  assert.equal(networkConnected({ isConnected: true, isInternetReachable: false }), false);
  assert.equal(networkConnected({ isConnected: false }), false);
});

test("#353: only src/network-changes.ts listens to expo-network itself", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  const listening = files("src").filter((file) => readFileSync(file, "utf8").includes("addNetworkStateListener"));
  assert.deepEqual(listening, [join("src", "network-changes.ts")]);
});

test("#353: the stored page asks the instance again until it answers, not only at network events", () => {
  const shell = readFileSync("src/screens/Shell.tsx", "utf8");
  const effect = shell.slice(shell.indexOf("if (!showingCopy) return;"), shell.indexOf("}, [showingCopy, server, run, goLive]);"));
  assert.match(effect, /retryDelay\(attempt\+\+\)/);
  assert.match(effect, /run\(reachedScript\)/);
  assert.match(effect, /onNetworkChange\(/);
});
