// The texts of the Siri, Shortcuts, Focus filter and control parts
// (plugins/intents/app and ios) in German and French; the English text is
// the key, as in plugins/widget-suite/strings.js. app.config.ts adds them to
// Localizable.strings of the app and the widget extension,
// plugins/with-intents.js the phrases to AppShortcuts.strings.
// test/intents-native.test.ts checks that every text of the Swift sources
// is here (or in the widget suite's table), with the same placeholders.

const strings = {
  // Add a task
  "Add a task": { de: "Aufgabe hinzufügen", fr: "Ajouter une tâche" },
  "Adds a task to a list or database in Flowplan.": { de: "Fügt einer Liste oder Datenbank in Flowplan eine Aufgabe hinzu.", fr: "Ajoute une tâche à une liste ou une base de Flowplan." },
  "What's the task?": { de: "Was ist die Aufgabe?", fr: "Quelle est la tâche ?" },
  Due: { de: "Fällig", fr: "Échéance" },
  List: { de: "Liste", fr: "Liste" },
  "List or database": { de: "Liste oder Datenbank", fr: "Liste ou base de données" },
  "Added to %@": { de: "Hinzugefügt zu %@", fr: "Ajoutée à %@" },
  "Added to %@, due %@": { de: "Hinzugefügt zu %@, fällig %@", fr: "Ajoutée à %@, pour le %@" },
  // What's due today
  "What's due today?": { de: "Was ist heute fällig?", fr: "Qu’est-ce qui est à faire aujourd’hui ?" },
  "Your tasks due today and the overdue ones.": { de: "Deine heute fälligen und überfälligen Aufgaben.", fr: "Tes tâches du jour et celles en retard." },
  "Nothing due today": { de: "Heute ist nichts fällig", fr: "Rien à faire aujourd’hui" },
  "%d due today": { de: "%d heute fällig", fr: "%d pour aujourd’hui" },
  "%d overdue": { de: "%d überfällig", fr: "%d en retard" },
  "%@: %@": { de: "%@: %@", fr: "%@ : %@" },
  // Open a page
  "Open a page": { de: "Seite öffnen", fr: "Ouvrir une page" },
  "Opens a page or database in Flowplan.": { de: "Öffnet eine Seite oder Datenbank in Flowplan.", fr: "Ouvre une page ou une base dans Flowplan." },
  "Which page?": { de: "Welche Seite?", fr: "Quelle page ?" },
  "Flowplan page": { de: "Flowplan-Seite", fr: "Page Flowplan" },
  // Search
  "Search Flowplan": { de: "In Flowplan suchen", fr: "Rechercher dans Flowplan" },
  "Searches your pages, records and comments.": { de: "Durchsucht deine Seiten, Einträge und Kommentare.", fr: "Recherche dans tes pages, entrées et commentaires." },
  "Search for": { de: "Suchen nach", fr: "Rechercher" },
  "What are you looking for?": { de: "Wonach suchst du?", fr: "Que cherches-tu ?" },
  "Nothing found for “%@”": { de: "Nichts gefunden für „%@“", fr: "Rien trouvé pour « %@ »" },
  "%@ results for “%@”": { de: "%@ Treffer für „%@“", fr: "%@ résultats pour « %@ »" },
  "Search in the app": { de: "In der App suchen", fr: "Rechercher dans l’app" },
  "Opens Flowplan's search with this text.": { de: "Öffnet die Suche von Flowplan mit diesem Text.", fr: "Ouvre la recherche de Flowplan avec ce texte." },
  // Focus filter
  "Flowplan focus": { de: "Flowplan-Fokus", fr: "Concentration Flowplan" },
  "Shows one profile or workspace while this Focus is on.": { de: "Zeigt ein Profil oder einen Arbeitsbereich, solange dieser Fokus aktiv ist.", fr: "Affiche un profil ou un espace de travail tant que cette concentration est active." },
  "Profile or workspace": { de: "Profil oder Arbeitsbereich", fr: "Profil ou espace de travail" },
  "Hide notifications from other workspaces": { de: "Mitteilungen anderer Arbeitsbereiche ausblenden", fr: "Masquer les notifications des autres espaces" },
  "Other notifications hidden": { de: "Andere Mitteilungen ausgeblendet", fr: "Autres notifications masquées" },
  "Notifications as usual": { de: "Mitteilungen wie gewohnt", fr: "Notifications comme d’habitude" },
  "All workspaces": { de: "Alle Arbeitsbereiche", fr: "Tous les espaces de travail" },
  Flowplan: { de: "Flowplan", fr: "Flowplan" },
  // Controls
  "Opens the quick capture of Flowplan.": { de: "Öffnet die Schnellerfassung von Flowplan.", fr: "Ouvre la saisie rapide de Flowplan." },
  "Today's tasks": { de: "Heutige Aufgaben", fr: "Tâches du jour" },
  "Opens your tasks in Flowplan.": { de: "Öffnet deine Aufgaben in Flowplan.", fr: "Ouvre tes tâches dans Flowplan." },
};

// Siri and Shortcuts phrases (AppShortcuts.strings, next to the widget
// suite's).
const phrases = {
  "Add a task to ${applicationName}": { de: "Aufgabe zu ${applicationName} hinzufügen", fr: "Ajouter une tâche à ${applicationName}" },
  "New ${applicationName} task": { de: "Neue ${applicationName}-Aufgabe", fr: "Nouvelle tâche ${applicationName}" },
  "What's due today in ${applicationName}": { de: "Was ist heute in ${applicationName} fällig", fr: "Qu’est-ce qui est à faire aujourd’hui dans ${applicationName}" },
  "My ${applicationName} tasks for today": { de: "Meine ${applicationName}-Aufgaben für heute", fr: "Mes tâches ${applicationName} du jour" },
  "Open a page in ${applicationName}": { de: "Seite in ${applicationName} öffnen", fr: "Ouvrir une page dans ${applicationName}" },
  "Search ${applicationName}": { de: "In ${applicationName} suchen", fr: "Rechercher dans ${applicationName}" },
  "Search in ${applicationName}": { de: "Suche in ${applicationName}", fr: "Chercher dans ${applicationName}" },
};

const LANGS = ["de", "en", "fr"];

// Localizable.strings entries of one language: English text → translation.
function localizable(lang) {
  return Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, lang === "en" ? key : value[lang]]));
}

module.exports = { strings, phrases, LANGS, localizable };
