// The texts of the native iOS parts – the configurable widgets, controls,
// App Shortcuts and the configurable settings of the expo-widgets widgets –
// in German and French; the English text is the key (so a missing entry
// still reads as English). app.config.ts writes them into Localizable.strings
// of the app and the widget extension (locales → ios["Localizable.strings"]),
// plugins/with-widget-suite.js the phrases into AppShortcuts.strings.
// test/widget-suite-native.test.ts checks that every text of the Swift
// sources is here, in both languages, with the same placeholders.

const strings = {
  // Placeholders and formats
  "%d new": { de: "%d neu", fr: "%d nouvelles" },
  "%d open": { de: "%d offen", fr: "%d ouvertes" },
  "%d unread": { de: "%d ungelesen", fr: "%d non lues" },
  "%d-day streak": { de: "%d Tage in Folge", fr: "%d jours d’affilée" },
  "Saved to %@": { de: "Gesichert in %@", fr: "Enregistré dans %@" },
  "Timer started: %@": { de: "Timer gestartet: %@", fr: "Chrono démarré : %@" },
  // Widgets, controls and their descriptions
  "Quick capture": { de: "Schnellerfassung", fr: "Saisie rapide" },
  "Notes, tasks, voice memos and photos in one tap.": { de: "Notizen, Aufgaben, Sprachnotizen und Fotos mit einem Tipp.", fr: "Notes, tâches, mémos vocaux et photos en un geste." },
  Tasks: { de: "Aufgaben", fr: "Tâches" },
  "Check off tasks right on the home screen.": { de: "Aufgaben direkt auf dem Home-Bildschirm abhaken.", fr: "Coche tes tâches directement sur l’écran d’accueil." },
  Today: { de: "Heute", fr: "Aujourd’hui" },
  "Your appointments and what is due.": { de: "Deine Termine und was fällig ist.", fr: "Tes rendez-vous et ce qui est à faire." },
  "Page and favorites": { de: "Seite und Favoriten", fr: "Page et favoris" },
  "Your favorites, or one page or database view.": { de: "Deine Favoriten oder eine Seite bzw. Datenbank-Ansicht.", fr: "Tes favoris, ou une page ou une vue de base." },
  "Database counter": { de: "Datenbank-Zähler", fr: "Compteur de base" },
  "One number of a database, with its last 14 days.": { de: "Eine Zahl aus einer Datenbank, mit den letzten 14 Tagen.", fr: "Un chiffre d’une base, avec ses 14 derniers jours." },
  "Journal and habits": { de: "Tagebuch und Gewohnheiten", fr: "Journal et habitudes" },
  "Today's entry and your habits to check off.": { de: "Der heutige Eintrag und deine Gewohnheiten zum Abhaken.", fr: "L’entrée du jour et tes habitudes à cocher." },
  "Time this week": { de: "Zeit diese Woche", fr: "Temps cette semaine" },
  "Hours this week; start and stop the timer.": { de: "Stunden dieser Woche; Timer starten und stoppen.", fr: "Heures de la semaine ; démarrer et arrêter le chrono." },
  Mentions: { de: "Erwähnungen", fr: "Mentions" },
  "Who mentioned you; mark as read right away.": { de: "Wer dich erwähnt hat; gleich als gelesen markieren.", fr: "Qui t’a mentionné ; marquer comme lu tout de suite." },
  "Form responses": { de: "Formular-Eingänge", fr: "Réponses au formulaire" },
  "New responses to one of your forms.": { de: "Neue Eingänge eines deiner Formulare.", fr: "Les nouvelles réponses à l’un de tes formulaires." },
  "New note": { de: "Neue Notiz", fr: "Nouvelle note" },
  "Opens Flowplan to write a note.": { de: "Öffnet Flowplan, um eine Notiz zu schreiben.", fr: "Ouvre Flowplan pour écrire une note." },
  "Voice memo": { de: "Sprachnotiz", fr: "Mémo vocal" },
  "Records a voice memo into Flowplan.": { de: "Nimmt eine Sprachnotiz für Flowplan auf.", fr: "Enregistre un mémo vocal dans Flowplan." },
  "Start focus": { de: "Fokus starten", fr: "Démarrer la concentration" },
  "25 minutes of focus, then a break.": { de: "25 Minuten Fokus, dann eine Pause.", fr: "25 minutes de concentration, puis une pause." },
  Timer: { de: "Timer", fr: "Chrono" },
  "Starts your most recent timer or stops the running one.": { de: "Startet deinen zuletzt benutzten Timer oder stoppt den laufenden.", fr: "Démarre ton dernier chrono ou arrête celui en cours." },
  Running: { de: "Läuft", fr: "En cours" },
  Stopped: { de: "Gestoppt", fr: "Arrêté" },
  // Settings of the widgets
  "Save to": { de: "Speichern in", fr: "Enregistrer dans" },
  Note: { de: "Notiz", fr: "Note" },
  Task: { de: "Aufgabe", fr: "Tâche" },
  Photo: { de: "Foto", fr: "Photo" },
  Show: { de: "Zeigen", fr: "Afficher" },
  "My tasks": { de: "Meine Aufgaben", fr: "Mes tâches" },
  "Records of a database": { de: "Einträge einer Datenbank", fr: "Entrées d’une base" },
  "To-dos of a page": { de: "To-dos einer Seite", fr: "To-dos d’une page" },
  Filter: { de: "Filter", fr: "Filtre" },
  "All open": { de: "Alle offenen", fr: "Toutes les ouvertes" },
  "Due today": { de: "Heute fällig", fr: "Pour aujourd’hui" },
  Overdue: { de: "Überfällig", fr: "En retard" },
  Database: { de: "Datenbank", fr: "Base de données" },
  View: { de: "Ansicht", fr: "Vue" },
  Page: { de: "Seite", fr: "Page" },
  "Number of items": { de: "Anzahl", fr: "Nombre d’éléments" },
  Range: { de: "Zeitraum", fr: "Période" },
  "Next 3 days": { de: "Nächste 3 Tage", fr: "3 prochains jours" },
  "This week": { de: "Diese Woche", fr: "Cette semaine" },
  Calendar: { de: "Kalender", fr: "Calendrier" },
  Calendars: { de: "Kalender", fr: "Calendriers" },
  "Show tasks due": { de: "Fällige Aufgaben zeigen", fr: "Afficher les tâches à faire" },
  Favorites: { de: "Favoriten", fr: "Favoris" },
  "A page or database": { de: "Eine Seite oder Datenbank", fr: "Une page ou une base" },
  "First property": { de: "Erste Eigenschaft", fr: "Première propriété" },
  "Second property": { de: "Zweite Eigenschaft", fr: "Deuxième propriété" },
  Property: { de: "Eigenschaft", fr: "Propriété" },
  Value: { de: "Wert", fr: "Valeur" },
  "Number of records": { de: "Anzahl der Einträge", fr: "Nombre d’entrées" },
  Sum: { de: "Summe", fr: "Somme" },
  Average: { de: "Durchschnitt", fr: "Moyenne" },
  "Number property": { de: "Zahl-Eigenschaft", fr: "Propriété numérique" },
  "Only one group": { de: "Nur eine Gruppe", fr: "Un seul groupe" },
  "Group value": { de: "Wert der Gruppe", fr: "Valeur du groupe" },
  "History of the last 14 days": { de: "Verlauf der letzten 14 Tage", fr: "Historique des 14 derniers jours" },
  Journal: { de: "Journal", fr: "Journal" },
  Habits: { de: "Gewohnheiten", fr: "Habitudes" },
  Habit: { de: "Gewohnheit", fr: "Habitude" },
  "Timer for “Start”": { de: "Timer für „Starten“", fr: "Chrono pour « Démarrer »" },
  "Mentions and new tasks": { de: "Erwähnungen und neue Aufgaben", fr: "Mentions et nouvelles tâches" },
  "New tasks for me": { de: "Neue Aufgaben für mich", fr: "Nouvelles tâches pour moi" },
  "Unread only": { de: "Nur ungelesene", fr: "Non lues seulement" },
  Form: { de: "Formular", fr: "Formulaire" },
  // Parameters of the buttons (not shown, but named)
  Source: { de: "Quelle", fr: "Source" },
  Record: { de: "Eintrag", fr: "Entrée" },
  Position: { de: "Position", fr: "Position" },
  Text: { de: "Text", fr: "Texte" },
  Link: { de: "Link", fr: "Lien" },
  Notification: { de: "Mitteilung", fr: "Notification" },
  Done: { de: "Erledigt", fr: "Fait" },
  Open: { de: "Offen", fr: "Ouvert" },
  Minutes: { de: "Minuten", fr: "Minutes" },
  // What the widgets show
  "Mark as done": { de: "Als erledigt markieren", fr: "Marquer comme terminée" },
  "Check off habit": { de: "Gewohnheit abhaken", fr: "Cocher l’habitude" },
  "Mark as read": { de: "Als gelesen markieren", fr: "Marquer comme lu" },
  "Mark all read": { de: "Alle als gelesen markieren", fr: "Tout marquer comme lu" },
  "Start timer": { de: "Timer starten", fr: "Démarrer le chrono" },
  "Stop timer": { de: "Timer stoppen", fr: "Arrêter le chrono" },
  "Open Flowplan": { de: "Flowplan öffnen", fr: "Ouvrir Flowplan" },
  "Open Flowplan to sign in": { de: "Flowplan öffnen und anmelden", fr: "Ouvre Flowplan pour te connecter" },
  "Edit the widget and choose a page": { de: "Widget bearbeiten und eine Seite wählen", fr: "Modifie le widget et choisis une page" },
  "No longer available – edit the widget": { de: "Nicht mehr verfügbar – Widget bearbeiten", fr: "Plus disponible – modifie le widget" },
  "Can’t be reached right now": { de: "Gerade nicht erreichbar", fr: "Injoignable pour le moment" },
  "Protected by the journal PIN – unlock it in Flowplan": { de: "Mit Journal-PIN geschützt – in Flowplan entsperren", fr: "Protégé par le code du journal – déverrouille-le dans Flowplan" },
  "End-to-end encrypted – readable in Flowplan only": { de: "Ende-zu-Ende-verschlüsselt – nur in Flowplan lesbar", fr: "Chiffré de bout en bout – lisible uniquement dans Flowplan" },
  Locked: { de: "Gesperrt", fr: "Verrouillé" },
  Encrypted: { de: "Verschlüsselt", fr: "Chiffré" },
  Untitled: { de: "Ohne Titel", fr: "Sans titre" },
  "All done": { de: "Alles erledigt", fr: "Tout est fait" },
  "All day": { de: "Ganztägig", fr: "Toute la journée" },
  "Nothing scheduled": { de: "Keine Termine", fr: "Rien de prévu" },
  "Nothing here yet": { de: "Noch keine Einträge", fr: "Rien ici pour l’instant" },
  "History partly estimated": { de: "Verlauf zum Teil geschätzt", fr: "Historique en partie estimé" },
  "Written today": { de: "Heute geschrieben", fr: "Écrit aujourd’hui" },
  "Write today": { de: "Heute schreiben", fr: "Écrire aujourd’hui" },
  "Start a timer in Flowplan": { de: "Starte einen Timer in Flowplan", fr: "Lance un chrono dans Flowplan" },
  "No new mentions": { de: "Keine neuen Erwähnungen", fr: "Aucune nouvelle mention" },
  "No new responses": { de: "Keine neuen Eingänge", fr: "Aucune nouvelle réponse" },
  new: { de: "neu", fr: "nouvelles" },
  Tomorrow: { de: "Morgen", fr: "Demain" },
  Yesterday: { de: "Gestern", fr: "Hier" },
  // App Shortcuts and Siri
  "Add a note": { de: "Notiz hinzufügen", fr: "Ajouter une note" },
  "Saves a note to your Flowplan capture inbox.": { de: "Sichert eine Notiz im Erfassungs-Eingang von Flowplan.", fr: "Enregistre une note dans la boîte de saisie de Flowplan." },
  "What should the note say?": { de: "Was soll in der Notiz stehen?", fr: "Que doit dire la note ?" },
  "Nowhere to capture to. Create a database in Flowplan.": { de: "Kein Ziel zum Erfassen. Lege in Flowplan eine Datenbank an.", fr: "Aucune destination. Crée une base de données dans Flowplan." },
  "What's on today?": { de: "Was steht heute an?", fr: "Qu’est-ce qui est prévu aujourd’hui ?" },
  "Today's appointments and tasks due.": { de: "Die Termine von heute und fällige Aufgaben.", fr: "Les rendez-vous du jour et les tâches à faire." },
  "Starts your most recent timer again.": { de: "Startet deinen zuletzt benutzten Timer wieder.", fr: "Relance ton dernier chrono." },
  "Stops the running timer.": { de: "Stoppt den laufenden Timer.", fr: "Arrête le chrono en cours." },
  "Timer stopped": { de: "Timer gestoppt", fr: "Chrono arrêté" },
  "Record a voice memo": { de: "Sprachnotiz aufnehmen", fr: "Enregistrer un mémo vocal" },
  "Opens Flowplan and starts recording.": { de: "Öffnet Flowplan und startet die Aufnahme.", fr: "Ouvre Flowplan et lance l’enregistrement." },
  // Made-up content of the widget gallery
  Inbox: { de: "Eingang", fr: "Boîte d’entrée" },
  "Send offer to Miller": { de: "Angebot an Müller senden", fr: "Envoyer l’offre à Martin" },
  "Prepare the retro": { de: "Retro vorbereiten", fr: "Préparer la rétro" },
  "Submit travel expenses": { de: "Reisekosten abrechnen", fr: "Note de frais du voyage" },
  "Review website copy": { de: "Website-Texte prüfen", fr: "Relire les textes du site" },
  Sales: { de: "Vertrieb", fr: "Ventes" },
  Team: { de: "Team", fr: "Équipe" },
  Finance: { de: "Finanzen", fr: "Finances" },
  Marketing: { de: "Marketing", fr: "Marketing" },
  "Stand-up": { de: "Standup", fr: "Point d’équipe" },
  "Client meeting Miller": { de: "Kundentermin Müller", fr: "Rendez-vous client Martin" },
  "Weekly plan": { de: "Wochenplan", fr: "Plan de la semaine" },
  "Website relaunch": { de: "Website-Relaunch", fr: "Refonte du site" },
  Brainstorming: { de: "Brainstorming", fr: "Remue-méninges" },
  Applications: { de: "Bewerbungen", fr: "Candidatures" },
  Records: { de: "Einträge", fr: "Entrées" },
  "My journal": { de: "Mein Journal", fr: "Mon journal" },
  Run: { de: "Laufen", fr: "Courir" },
  Read: { de: "Lesen", fr: "Lire" },
  "No sugar": { de: "Kein Zucker", fr: "Sans sucre" },
  "Write offer": { de: "Angebot schreiben", fr: "Rédiger l’offre" },
  Projects: { de: "Projekte", fr: "Projets" },
  "Ada mentioned you in “Roadmap”": { de: "Ada hat dich in „Roadmap“ erwähnt", fr: "Ada t’a mentionné dans « Roadmap »" },
  "Ben gave you “Prepare the retro”": { de: "Ben hat dir „Retro vorbereiten“ gegeben", fr: "Ben t’a confié « Préparer la rétro »" },
  "Contact form": { de: "Kontaktformular", fr: "Formulaire de contact" },
};

// Siri and Shortcuts phrases (AppShortcuts.strings).
const phrases = {
  "Add a note to ${applicationName}": { de: "Notiz zu ${applicationName} hinzufügen", fr: "Ajouter une note à ${applicationName}" },
  "New ${applicationName} note": { de: "Neue ${applicationName}-Notiz", fr: "Nouvelle note ${applicationName}" },
  "What's on today in ${applicationName}": { de: "Was steht heute in ${applicationName} an", fr: "Qu’est-ce qui est prévu aujourd’hui dans ${applicationName}" },
  "What's on today with ${applicationName}": { de: "Was steht heute an mit ${applicationName}", fr: "Mon programme du jour avec ${applicationName}" },
  "Start the timer in ${applicationName}": { de: "Timer in ${applicationName} starten", fr: "Démarrer le chrono dans ${applicationName}" },
  "Start a ${applicationName} timer": { de: "${applicationName}-Timer starten", fr: "Lancer un chrono ${applicationName}" },
  "Stop the timer in ${applicationName}": { de: "Timer in ${applicationName} stoppen", fr: "Arrêter le chrono dans ${applicationName}" },
  "Record a voice memo in ${applicationName}": { de: "Sprachnotiz in ${applicationName} aufnehmen", fr: "Enregistrer un mémo vocal dans ${applicationName}" },
  "Start focus in ${applicationName}": { de: "Fokus in ${applicationName} starten", fr: "Démarrer la concentration dans ${applicationName}" },
};

// The widget gallery on Android (labels and descriptions; iOS takes them
// from Localizable.strings above, keyed by the English text).
const gallery = {
  FlowplanTasks: { label: ["Flowplan", "Flowplan", "Flowplan"], description: ["Fällige Aufgaben auf einen Blick.", "Tasks due at a glance.", "Les tâches à faire en un coup d’œil."] },
  FlowplanInbox: { label: ["Flowplan Posteingang", "Flowplan Inbox", "Flowplan Boîte de réception"], description: ["Ungelesene Mitteilungen.", "Unread notifications.", "Notifications non lues."] },
  FlowplanInstance: { label: ["Flowplan Instanz", "Flowplan Instance", "Flowplan Instance"], description: ["Für Administratoren: Zustand, Version und letzte Sicherung.", "For administrators: state, version and last backup.", "Pour les administrateurs : état, version et dernière sauvegarde."] },
  FlowplanLive: { label: ["Flowplan Live", "Flowplan Live", "Flowplan Live"], description: ["Für Administratoren: eine Live-Zahl der Instanz.", "For administrators: one live number of the instance.", "Pour les administrateurs : un chiffre en direct de l’instance."] },
  FlowplanStorage: { label: ["Flowplan Speicher", "Flowplan Storage", "Flowplan Stockage"], description: ["Für Administratoren: Speicher, Festplatte und Kontingente.", "For administrators: storage, disk and quotas.", "Pour les administrateurs : stockage, disque et quotas."] },
  FlowplanCapture: { label: ["Schnellerfassung", "Quick capture", "Saisie rapide"], description: ["Notizen, Aufgaben, Sprachnotizen und Fotos mit einem Tipp.", "Notes, tasks, voice memos and photos in one tap.", "Notes, tâches, mémos vocaux et photos en un geste."] },
  FlowplanTaskList: { label: ["Aufgaben", "Tasks", "Tâches"], description: ["Aufgaben direkt auf dem Home-Bildschirm abhaken.", "Check off tasks right on the home screen.", "Coche tes tâches directement sur l’écran d’accueil."] },
  FlowplanAgenda: { label: ["Heute", "Today", "Aujourd’hui"], description: ["Deine Termine und was fällig ist.", "Your appointments and what is due.", "Tes rendez-vous et ce qui est à faire."] },
  FlowplanPinned: { label: ["Seite und Favoriten", "Page and favorites", "Page et favoris"], description: ["Deine Favoriten oder eine Seite bzw. Datenbank-Ansicht.", "Your favorites, or one page or database view.", "Tes favoris, ou une page ou une vue de base."] },
  FlowplanCounter: { label: ["Datenbank-Zähler", "Database counter", "Compteur de base"], description: ["Eine Zahl aus einer Datenbank, mit den letzten 14 Tagen.", "One number of a database, with its last 14 days.", "Un chiffre d’une base, avec ses 14 derniers jours."] },
  FlowplanJournal: { label: ["Tagebuch und Gewohnheiten", "Journal and habits", "Journal et habitudes"], description: ["Der heutige Eintrag und deine Gewohnheiten zum Abhaken.", "Today’s entry and your habits to check off.", "L’entrée du jour et tes habitudes à cocher."] },
  FlowplanTime: { label: ["Zeit diese Woche", "Time this week", "Temps cette semaine"], description: ["Stunden dieser Woche; Timer starten und stoppen.", "Hours this week; start and stop the timer.", "Heures de la semaine ; démarrer et arrêter le chrono."] },
  FlowplanMentions: { label: ["Erwähnungen", "Mentions", "Mentions"], description: ["Wer dich erwähnt hat; gleich als gelesen markieren.", "Who mentioned you; mark as read right away.", "Qui t’a mentionné ; marquer comme lu tout de suite."] },
  FlowplanForms: { label: ["Formular-Eingänge", "Form responses", "Réponses au formulaire"], description: ["Neue Eingänge eines deiner Formulare.", "New responses to one of your forms.", "Les nouvelles réponses à l’un de tes formulaires."] },
};

const LANGS = ["de", "en", "fr"];

// Android string resources of the gallery for one language.
function galleryStrings(lang) {
  const index = { de: 0, en: 1, fr: 2 }[lang];
  const out = {};
  for (const [name, entry] of Object.entries(gallery)) {
    out[`widget_label_${name.toLowerCase()}`] = entry.label[index];
    out[`widget_${name.toLowerCase()}_description`] = entry.description[index];
  }
  return out;
}

// Localizable.strings of one language: English text → translation; with
// the gallery's names and descriptions (expo-widgets writes them into Swift
// as English text, which iOS looks up here).
function localizable(table, lang) {
  const out = Object.fromEntries(Object.entries(table).map(([key, value]) => [key, lang === "en" ? key : value[lang]]));
  const index = { de: 0, en: 1, fr: 2 }[lang];
  for (const entry of Object.values(gallery)) {
    out[entry.label[1]] ??= entry.label[index];
    out[entry.description[1]] ??= entry.description[index];
  }
  return out;
}

module.exports = { strings, phrases, gallery, galleryStrings, LANGS, localizable };
