// Which addresses the app accepts: only a Flowplan instance, over HTTPS (HTTP
// only for local development), that does not redirect to another site. Pure
// functions – the pages pass in the HTTP client, the tests a fake one.

export const DEFAULT_SERVER = "https://app.flowplan.org";

export class ServerError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"];

export function normalizeServer(input) {
  let value = String(input ?? "").trim();
  if (!value) throw new ServerError("empty");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ServerError("invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ServerError("invalid");
  // 10.0.2.2 is the development machine as seen from the Android emulator.
  const local = LOCAL_HOSTS.includes(url.hostname) || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !local) throw new ServerError("https");
  return url.origin;
}

// The health check names the service; older versions are recognised by the
// fields of their answer (like the desktop app).
export function isFlowplanHealth(data) {
  return (
    data?.service === "flowplan" ||
    Boolean(data && typeof data.checks === "object" && data.checks && "database" in data.checks && "searchBacklog" in data)
  );
}

// request({ url }) → { status, headers, data } without following redirects.
// Redirects within the same origin (e.g. a trailing slash) are followed, a
// redirect to another origin is refused with that origin.
export async function checkServer(origin, request) {
  let url = `${origin}/api/health`;
  for (let hop = 0; hop < 4; hop++) {
    let response;
    try {
      response = await request({ url });
    } catch (error) {
      throw new ServerError("unreachable", String(error?.message || error || ""));
    }
    const status = Number(response?.status) || 0;
    if (status >= 300 && status < 400) {
      const location = header(response.headers, "location");
      if (!location) throw new ServerError("notFlowplan");
      const next = new URL(location, url);
      if (next.origin !== origin) throw new ServerError("redirect", next.origin);
      url = next.href;
      continue;
    }
    let data = response?.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    if (!isFlowplanHealth(data)) throw new ServerError("notFlowplan");
    return true;
  }
  throw new ServerError("notFlowplan");
}

function header(headers, name) {
  if (!headers) return "";
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return String(value);
  return "";
}
