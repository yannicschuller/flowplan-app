import { test } from "node:test";
import assert from "node:assert/strict";
import { checkServer, isFlowplanHealth, isPlainHttp, localKind, normalizeServer, originOf, plainHttpAllowed, type HttpResponse } from "../src/server";
import { pickLocale, strings, t } from "../src/i18n";

test("addresses are normalised to an origin", () => {
  assert.equal(normalizeServer("app.flowplan.org"), "https://app.flowplan.org");
  assert.equal(normalizeServer("  https://app.flowplan.org/some/page?x=1 "), "https://app.flowplan.org");
  assert.equal(normalizeServer("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeServer("http://10.0.2.2:3150"), "http://10.0.2.2:3150");
  assert.equal(normalizeServer("flowplan.example.com:8443"), "https://flowplan.example.com:8443");
  assert.equal(originOf("https://a.example/x#y"), "https://a.example");
  assert.equal(originOf("mailto:a@b.c"), null);
  assert.equal(originOf("nonsense"), null);
});

test("plain HTTP to public addresses, other schemes and nonsense are refused", () => {
  assert.throws(() => normalizeServer(""), { code: "empty" });
  assert.throws(() => normalizeServer("http://flowplan.example.com"), { code: "https" });
  assert.throws(() => normalizeServer("http://example.com"), { code: "https" });
  assert.throws(() => normalizeServer("http://8.8.8.8"), { code: "https" });
  assert.throws(() => normalizeServer("ftp://flowplan.example.com"), { code: "invalid" });
  assert.throws(() => normalizeServer("javascript://alert(1)"), { code: "invalid" });
  assert.throws(() => normalizeServer("https://exa mple.com"), { code: "invalid" });
});

test("local network addresses are told from public ones", () => {
  const local: [string, string][] = [
    ["127.0.0.1", "ip"],
    ["127.1.2.3", "ip"],
    ["10.0.2.2", "ip"],
    ["10.255.255.255", "ip"],
    ["172.16.0.1", "ip"],
    ["172.31.255.254", "ip"],
    ["192.168.1.20", "ip"],
    ["169.254.10.1", "ip"],
    ["100.64.0.1", "ip"],
    ["100.127.255.255", "ip"],
    ["[::1]", "ip"],
    ["[fc00::1]", "ip"],
    ["[fd12:3456:789a::1]", "ip"],
    ["[fe80::1]", "ip"],
    ["[febf::1]", "ip"],
    ["localhost", "name"],
    ["nas", "name"],
    ["NAS", "name"],
    ["flowplan.local", "local"],
    ["flowplan.lan", "domain"],
    ["flowplan.home.arpa", "domain"],
    ["flowplan.internal", "domain"],
    ["app.localhost", "domain"],
  ];
  for (const [host, kind] of local) assert.equal(localKind(host), kind, host);
  const public_ = [
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "192.169.1.1",
    "192.167.1.1",
    "169.253.1.1",
    "11.0.0.1",
    "8.8.8.8",
    "0.0.0.0",
    "[2001:db8::1]",
    "[2a00:1450::1]",
    "[fec0::1]",
    "[::ffff:c0a8:101]",
    "example.com",
    "flowplan.example.com",
    "nas.ts.net",
    "flowplan.tail1234.ts.net",
    "local.example.com",
    "lan.example.com",
    "nas.",
    "",
  ];
  for (const host of public_) assert.equal(localKind(host), null, host);
  // iOS (App Transport Security) lets only IPs, names without a dot and .local through.
  assert.ok(plainHttpAllowed("flowplan.lan", "android"));
  assert.ok(!plainHttpAllowed("flowplan.lan", "ios"));
  assert.ok(plainHttpAllowed("flowplan.local", "ios"));
  assert.ok(plainHttpAllowed("nas", "ios"));
  assert.ok(plainHttpAllowed("[fd00::1]", "ios"));
  assert.ok(!plainHttpAllowed("example.com", "android"));
});

test("plain HTTP is accepted in the local network only, HTTPS everywhere", () => {
  assert.equal(normalizeServer("http://192.168.1.20:3000/login"), "http://192.168.1.20:3000");
  assert.equal(normalizeServer("http://nas"), "http://nas");
  assert.equal(normalizeServer("http://NAS:8080", "ios"), "http://nas:8080");
  assert.equal(normalizeServer("http://flowplan.local", "ios"), "http://flowplan.local");
  assert.equal(normalizeServer("http://[fd00::5]:3000"), "http://[fd00::5]:3000");
  assert.equal(normalizeServer("http://100.100.1.2"), "http://100.100.1.2");
  // The URL parser's other spellings of an IPv4 address count as that address.
  assert.equal(normalizeServer("http://3232235796"), "http://192.168.1.20");
  assert.throws(() => normalizeServer("http://172.32.0.1"), { code: "https" });
  assert.throws(() => normalizeServer("http://100.63.1.1"), { code: "https" });
  assert.throws(() => normalizeServer("http://192.169.1.1"), { code: "https" });
  assert.throws(() => normalizeServer("http://nas.tail1234.ts.net"), { code: "https" });
  assert.throws(() => normalizeServer("http://example.com", "ios"), { code: "https" });
  // Android takes home-network suffixes, iOS explains why not.
  assert.equal(normalizeServer("http://flowplan.lan"), "http://flowplan.lan");
  assert.equal(normalizeServer("http://flowplan.home.arpa", "android"), "http://flowplan.home.arpa");
  assert.throws(() => normalizeServer("http://flowplan.lan", "ios"), { code: "httpName" });
  assert.throws(() => normalizeServer("http://dev.localhost", "ios"), { code: "httpName" });
  // HTTPS is fine for any address, local or public.
  for (const host of ["example.com", "8.8.8.8", "nas", "flowplan.lan", "nas.tail1234.ts.net", "192.168.1.20"])
    for (const platform of ["ios", "android"] as const) assert.equal(normalizeServer(`https://${host}`, platform), `https://${host}`);
  // An address without a scheme means HTTPS – never silently plain HTTP.
  assert.equal(normalizeServer("192.168.1.20:3000"), "https://192.168.1.20:3000");
  // The setup screen warns for what will connect without encryption.
  assert.ok(isPlainHttp("http://192.168.1.20:3000"));
  assert.ok(!isPlainHttp("https://192.168.1.20"));
  assert.ok(!isPlainHttp("http://example.com"));
  assert.ok(!isPlainHttp("http://flowplan.lan", "ios"));
  assert.ok(!isPlainHttp("http://"));
});

test("the health check must name Flowplan", () => {
  assert.ok(isFlowplanHealth({ service: "flowplan", ok: true }));
  assert.ok(isFlowplanHealth({ checks: { database: true }, searchBacklog: 0 }));
  assert.ok(!isFlowplanHealth({ status: "ok" }));
  assert.ok(!isFlowplanHealth(null));
});

const fake = (answers: Record<string, HttpResponse>) => {
  const seen: string[] = [];
  return {
    seen,
    request: async ({ url }: { url: string }) => {
      seen.push(url);
      const answer = answers[url];
      if (!answer) throw new Error("offline");
      return answer;
    },
  };
};

test("a Flowplan instance is accepted", async () => {
  const { request, seen } = fake({
    "https://app.flowplan.org/api/health": { status: 200, data: { service: "flowplan" } },
  });
  assert.equal(await checkServer("https://app.flowplan.org", request), true);
  assert.deepEqual(seen, ["https://app.flowplan.org/api/health"]);
});

test("a JSON body as text is understood", async () => {
  const { request } = fake({ "https://a.example/api/health": { status: 200, data: '{"service":"flowplan"}' } });
  assert.equal(await checkServer("https://a.example", request), true);
});

test("other services, unreachable and redirecting addresses are refused", async () => {
  const { request } = fake({
    "https://other.example/api/health": { status: 200, data: { status: "ok" } },
    "https://html.example/api/health": { status: 200, data: "<!doctype html>" },
    "https://moved.example/api/health": { status: 301, headers: { Location: "https://new.example/api/health" } },
  });
  await assert.rejects(checkServer("https://other.example", request), { code: "notFlowplan" });
  await assert.rejects(checkServer("https://html.example", request), { code: "notFlowplan" });
  await assert.rejects(checkServer("https://gone.example", request), { code: "unreachable" });
  await assert.rejects(checkServer("https://moved.example", request), { code: "redirect", detail: "https://new.example" });
});

test("redirects within the instance are followed", async () => {
  const { request, seen } = fake({
    "https://a.example/api/health": { status: 308, headers: { location: "/api/health/" } },
    "https://a.example/api/health/": { status: 200, data: { service: "flowplan" } },
  });
  assert.equal(await checkServer("https://a.example", request), true);
  assert.equal(seen.length, 2);
});

test("the app speaks German, English, French and Simplified Chinese", () => {
  assert.equal(pickLocale(["de-AT", "en"]), "de");
  assert.equal(pickLocale(["fr-CA"]), "fr");
  assert.equal(pickLocale(["es-ES", "fr"]), "fr");
  assert.equal(pickLocale(["ja", null]), "en");
  assert.equal(pickLocale(["de_DE"]), "de");
  // Simplified Chinese: iOS names the script, Android often only the region.
  for (const tag of ["zh-Hans-CN", "zh-Hans", "zh-CN", "zh_CN", "zh-SG", "zh-Hans-HK", "zh"]) assert.equal(pickLocale([tag, "en"]), "zh", tag);
  // Traditional Chinese is not "zh": the next language, else English.
  for (const tag of ["zh-Hant-TW", "zh-Hant-HK", "zh-Hant", "zh-TW", "zh-HK", "zh-MO", "zh_TW"]) {
    assert.equal(pickLocale([tag]), "en", tag);
    assert.equal(pickLocale([tag, "de-DE"]), "de", tag);
  }
  assert.equal(pickLocale(["constructor"]), "en");
  assert.equal(t("redirect", { server: "a", detail: "b" }, "de"), "a leitet auf b weiter. Gib bitte diese Adresse ein.");
  for (const lang of ["de", "fr", "zh"] as const) {
    assert.deepEqual(Object.keys(strings[lang]).sort(), Object.keys(strings.en).sort(), `${lang} misses texts`);
    for (const [key, text] of Object.entries(strings[lang]))
      assert.deepEqual(
        text.match(/\{\w+\}/g)?.sort() ?? [],
        strings.en[key as keyof typeof strings.en].match(/\{\w+\}/g)?.sort() ?? [],
        `${lang}.${key} has other placeholders`,
      );
  }
});
