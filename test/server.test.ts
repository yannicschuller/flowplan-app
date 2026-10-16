import { test } from "node:test";
import assert from "node:assert/strict";
import { checkServer, isFlowplanHealth, normalizeServer, originOf, type HttpResponse } from "../src/server";
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

test("plain HTTP, other schemes and nonsense are refused", () => {
  assert.throws(() => normalizeServer(""), { code: "empty" });
  assert.throws(() => normalizeServer("http://flowplan.example.com"), { code: "https" });
  assert.throws(() => normalizeServer("ftp://flowplan.example.com"), { code: "invalid" });
  assert.throws(() => normalizeServer("javascript://alert(1)"), { code: "invalid" });
  assert.throws(() => normalizeServer("https://exa mple.com"), { code: "invalid" });
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

test("the app speaks German, English and French", () => {
  assert.equal(pickLocale(["de-AT", "en"]), "de");
  assert.equal(pickLocale(["fr-CA"]), "fr");
  assert.equal(pickLocale(["es-ES", "fr"]), "fr");
  assert.equal(pickLocale(["ja", null]), "en");
  assert.equal(pickLocale(["de_DE"]), "de");
  assert.equal(t("redirect", { server: "a", detail: "b" }, "de"), "a leitet auf b weiter. Gib bitte diese Adresse ein.");
  for (const lang of ["de", "fr"] as const) {
    assert.deepEqual(Object.keys(strings[lang]).sort(), Object.keys(strings.en).sort(), `${lang} misses texts`);
    for (const [key, text] of Object.entries(strings[lang]))
      assert.deepEqual(
        text.match(/\{\w+\}/g)?.sort() ?? [],
        strings.en[key as keyof typeof strings.en].match(/\{\w+\}/g)?.sort() ?? [],
        `${lang}.${key} has other placeholders`,
      );
  }
});
