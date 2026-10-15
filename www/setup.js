// First start and "Change server": asks for the instance, suggesting
// app.flowplan.org (or the address a managed installation configured), and
// only accepts a real Flowplan instance. Afterwards the app starts straight
// into the instance.
import { DEFAULT_SERVER, ServerError, checkServer, normalizeServer } from "./server.js";
import { t, translatePage } from "./i18n.js";
import { request, shell } from "./native.js";

const form = document.getElementById("form"),
  input = document.getElementById("server"),
  error = document.getElementById("error"),
  submit = document.getElementById("submit"),
  cancel = document.getElementById("cancel");

translatePage();
const setup = new URLSearchParams(location.search).has("setup");
const { server, suggested } = await shell("getServer").catch(() => ({}));
if (server && !setup) {
  await shell("open");
} else {
  input.value = (suggested || server || DEFAULT_SERVER).replace(/^https:\/\//, "");
  cancel.hidden = !server;
  document.body.hidden = false;
}

cancel.addEventListener("click", () => shell("open"));
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  let origin = "";
  submit.disabled = true;
  submit.textContent = t("connecting");
  try {
    origin = normalizeServer(input.value);
    await checkServer(origin, request);
    await shell("setServer", { server: origin });
    await shell("open");
  } catch (e) {
    const code = e instanceof ServerError ? e.code : "unreachable";
    error.textContent = t(code, { server: origin || input.value, detail: e.detail || "" });
    submit.disabled = false;
    submit.textContent = t("connect");
    input.focus();
  }
});
