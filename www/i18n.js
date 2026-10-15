// The app's own pages speak the languages of Flowplan: German, English and
// French, after the system language (English otherwise).
const strings = {
  de: {
    setupTitle: "Willkommen bei Flowplan",
    setupText: "Verbinde dich mit app.flowplan.org oder gib die Adresse deiner eigenen Flowplan-Instanz ein.",
    setupHint: "Ändern kannst du sie später, indem du das App-Symbol gedrückt hältst: „Server wechseln“.",
    label: "Adresse der Instanz",
    placeholder: "flowplan.deine-firma.de",
    connect: "Verbinden",
    connecting: "Verbinde …",
    cancel: "Abbrechen",
    empty: "Bitte die Adresse deiner Flowplan-Instanz eingeben.",
    invalid: "Das ist keine gültige Adresse.",
    https: "Nur HTTPS-Adressen sind erlaubt (HTTP nur für localhost).",
    unreachable: "Unter {server} ist nichts erreichbar. Prüfe die Adresse und deine Internetverbindung.",
    redirect: "{server} leitet auf {detail} weiter. Gib bitte diese Adresse ein.",
    notFlowplan: "Unter {server} läuft kein Flowplan.",
    offlineTitle: "Keine Verbindung zu Flowplan",
    offlineText: "Der Server ist gerade nicht erreichbar. Prüfe deine Internetverbindung oder die Adresse der Instanz.",
    offlineServer: "{server} ist gerade nicht erreichbar. Prüfe deine Internetverbindung – Flowplan versucht es von selbst wieder, sobald du online bist.",
    retry: "Erneut versuchen",
    changeServer: "Server wechseln",
  },
  en: {
    setupTitle: "Welcome to Flowplan",
    setupText: "Connect to app.flowplan.org or enter the address of your own Flowplan instance.",
    setupHint: "You can change it later by pressing and holding the app icon: “Change server”.",
    label: "Instance address",
    placeholder: "flowplan.your-company.com",
    connect: "Connect",
    connecting: "Connecting …",
    cancel: "Cancel",
    empty: "Please enter the address of your Flowplan instance.",
    invalid: "This is not a valid address.",
    https: "Only HTTPS addresses are allowed (HTTP only for localhost).",
    unreachable: "Nothing answers at {server}. Check the address and your internet connection.",
    redirect: "{server} redirects to {detail}. Please enter that address.",
    notFlowplan: "There is no Flowplan running at {server}.",
    offlineTitle: "No connection to Flowplan",
    offlineText: "The server cannot be reached right now. Check your internet connection or the instance address.",
    offlineServer: "{server} cannot be reached right now. Check your internet connection – Flowplan tries again by itself as soon as you are online.",
    retry: "Try again",
    changeServer: "Change server",
  },
  fr: {
    setupTitle: "Bienvenue dans Flowplan",
    setupText: "Connecte-toi à app.flowplan.org ou saisis l’adresse de ta propre instance Flowplan.",
    setupHint: "Tu pourras la modifier plus tard en maintenant l’icône de l’app : « Changer de serveur ».",
    label: "Adresse de l’instance",
    placeholder: "flowplan.ton-entreprise.fr",
    connect: "Se connecter",
    connecting: "Connexion …",
    cancel: "Annuler",
    empty: "Saisis l’adresse de ton instance Flowplan.",
    invalid: "Cette adresse n’est pas valide.",
    https: "Seules les adresses HTTPS sont autorisées (HTTP uniquement pour localhost).",
    unreachable: "Rien ne répond à {server}. Vérifie l’adresse et ta connexion Internet.",
    redirect: "{server} redirige vers {detail}. Saisis plutôt cette adresse.",
    notFlowplan: "Aucun Flowplan ne tourne à {server}.",
    offlineTitle: "Pas de connexion à Flowplan",
    offlineText: "Le serveur est injoignable pour le moment. Vérifie ta connexion Internet ou l’adresse de l’instance.",
    offlineServer: "{server} est injoignable pour le moment. Vérifie ta connexion Internet – Flowplan réessaie tout seul dès que tu es en ligne.",
    retry: "Réessayer",
    changeServer: "Changer de serveur",
  },
};

export function pickLocale(languages) {
  for (const language of languages || []) {
    const base = String(language).toLowerCase().split("-")[0];
    if (base in strings) return base;
  }
  return "en";
}

export const locale = pickLocale(globalThis.navigator?.languages || [globalThis.navigator?.language]);

export function t(key, params = {}, lang = locale) {
  const text = strings[lang]?.[key] ?? strings.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

// Fills every element with data-t (text) or data-t-placeholder.
export function translatePage(root = document) {
  document.documentElement.lang = locale;
  for (const el of root.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll("[data-t-placeholder]")) el.placeholder = t(el.dataset.tPlaceholder);
}

export { strings };
