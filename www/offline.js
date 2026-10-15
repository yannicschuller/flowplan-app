// Shown by the shell when the instance cannot be reached. Tries again by
// itself once the connection is back.
import { t, translatePage } from "./i18n.js";
import { shell } from "./native.js";

translatePage();
const server = new URLSearchParams(location.search).get("server");
if (server) document.getElementById("detail").textContent = t("offlineServer", { server: server.replace(/^https:\/\//, "") });
const retry = () => shell("open");
document.getElementById("retry").addEventListener("click", retry);
document.getElementById("change").addEventListener("click", () => location.assign("index.html?setup=1"));
window.addEventListener("online", retry);
