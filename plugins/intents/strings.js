// The texts of the Siri, Shortcuts, Focus filter and control parts
// (plugins/intents/app and ios) in German, French and Simplified Chinese
// (zh); the English text is the key, as in plugins/widget-suite/strings.js.
// app.config.ts adds them to Localizable.strings of the app and the widget
// extension, plugins/with-intents.js the phrases to AppShortcuts.strings.
// test/intents-native.test.ts checks that every text of the Swift sources
// is here (or in the widget suite's table), with the same placeholders.

const strings = {
  // Add a task
  "Add a task": { de: "Aufgabe hinzufügen", fr: "Ajouter une tâche", zh: "添加任务" },
  "Adds a task to a list or database in Flowplan.": { de: "Fügt einer Liste oder Datenbank in Flowplan eine Aufgabe hinzu.", fr: "Ajoute une tâche à une liste ou une base de Flowplan.", zh: "在 Flowplan 的列表或数据库中添加任务。" },
  "What's the task?": { de: "Was ist die Aufgabe?", fr: "Quelle est la tâche ?", zh: "任务是什么？" },
  Due: { de: "Fällig", fr: "Échéance", zh: "到期" },
  List: { de: "Liste", fr: "Liste", zh: "列表" },
  "List or database": { de: "Liste oder Datenbank", fr: "Liste ou base de données", zh: "列表或数据库" },
  "Added to %@": { de: "Hinzugefügt zu %@", fr: "Ajoutée à %@", zh: "已添加到 %@" },
  "Added to %@, due %@": { de: "Hinzugefügt zu %@, fällig %@", fr: "Ajoutée à %@, pour le %@", zh: "已添加到 %@，%@ 到期" },
  // What's due today
  "What's due today?": { de: "Was ist heute fällig?", fr: "Qu’est-ce qui est à faire aujourd’hui ?", zh: "今天有什么到期？" },
  "Your tasks due today and the overdue ones.": { de: "Deine heute fälligen und überfälligen Aufgaben.", fr: "Tes tâches du jour et celles en retard.", zh: "你今天到期和已逾期的任务。" },
  "Nothing due today": { de: "Heute ist nichts fällig", fr: "Rien à faire aujourd’hui", zh: "今天没有到期的任务" },
  "%d due today": { de: "%d heute fällig", fr: "%d pour aujourd’hui", zh: "%d 项今天到期" },
  "%d overdue": { de: "%d überfällig", fr: "%d en retard", zh: "%d 项逾期" },
  "%@: %@": { de: "%@: %@", fr: "%@ : %@", zh: "%@：%@" },
  // Open a page
  "Open a page": { de: "Seite öffnen", fr: "Ouvrir une page", zh: "打开页面" },
  "Opens a page or database in Flowplan.": { de: "Öffnet eine Seite oder Datenbank in Flowplan.", fr: "Ouvre une page ou une base dans Flowplan.", zh: "在 Flowplan 中打开页面或数据库。" },
  "Which page?": { de: "Welche Seite?", fr: "Quelle page ?", zh: "哪个页面？" },
  "Flowplan page": { de: "Flowplan-Seite", fr: "Page Flowplan", zh: "Flowplan 页面" },
  // Search
  "Search Flowplan": { de: "In Flowplan suchen", fr: "Rechercher dans Flowplan", zh: "搜索 Flowplan" },
  "Searches your pages, records and comments.": { de: "Durchsucht deine Seiten, Einträge und Kommentare.", fr: "Recherche dans tes pages, entrées et commentaires.", zh: "搜索你的页面、记录和评论。" },
  "Search for": { de: "Suchen nach", fr: "Rechercher", zh: "搜索内容" },
  "What are you looking for?": { de: "Wonach suchst du?", fr: "Que cherches-tu ?", zh: "你要找什么？" },
  "Nothing found for “%@”": { de: "Nichts gefunden für „%@“", fr: "Rien trouvé pour « %@ »", zh: "未找到“%@”的结果" },
  "%@ results for “%@”": { de: "%@ Treffer für „%@“", fr: "%@ résultats pour « %@ »", zh: "找到 %@ 个与“%@”相关的结果" },
  "Search in the app": { de: "In der App suchen", fr: "Rechercher dans l’app", zh: "在应用中搜索" },
  "Opens Flowplan's search with this text.": { de: "Öffnet die Suche von Flowplan mit diesem Text.", fr: "Ouvre la recherche de Flowplan avec ce texte.", zh: "用此文本打开 Flowplan 的搜索。" },
  // Focus filter
  "Flowplan focus": { de: "Flowplan-Fokus", fr: "Concentration Flowplan", zh: "Flowplan 专注模式" },
  "Shows one profile or workspace while this Focus is on.": { de: "Zeigt ein Profil oder einen Arbeitsbereich, solange dieser Fokus aktiv ist.", fr: "Affiche un profil ou un espace de travail tant que cette concentration est active.", zh: "此专注模式打开时，只显示一个账户或工作区。" },
  "Profile or workspace": { de: "Profil oder Arbeitsbereich", fr: "Profil ou espace de travail", zh: "账户或工作区" },
  "Hide notifications from other workspaces": { de: "Mitteilungen anderer Arbeitsbereiche ausblenden", fr: "Masquer les notifications des autres espaces", zh: "隐藏其他工作区的通知" },
  "Other notifications hidden": { de: "Andere Mitteilungen ausgeblendet", fr: "Autres notifications masquées", zh: "其他通知已隐藏" },
  "Notifications as usual": { de: "Mitteilungen wie gewohnt", fr: "Notifications comme d’habitude", zh: "通知照常显示" },
  "All workspaces": { de: "Alle Arbeitsbereiche", fr: "Tous les espaces de travail", zh: "所有工作区" },
  Flowplan: { de: "Flowplan", fr: "Flowplan", zh: "Flowplan" },
  // Controls
  "Opens the quick capture of Flowplan.": { de: "Öffnet die Schnellerfassung von Flowplan.", fr: "Ouvre la saisie rapide de Flowplan.", zh: "打开 Flowplan 的快速捕获。" },
  "Today's tasks": { de: "Heutige Aufgaben", fr: "Tâches du jour", zh: "今天的任务" },
  "Opens your tasks in Flowplan.": { de: "Öffnet deine Aufgaben in Flowplan.", fr: "Ouvre tes tâches dans Flowplan.", zh: "在 Flowplan 中打开你的任务。" },
};

// Siri and Shortcuts phrases (AppShortcuts.strings, next to the widget
// suite's).
const phrases = {
  "Add a task to ${applicationName}": { de: "Aufgabe zu ${applicationName} hinzufügen", fr: "Ajouter une tâche à ${applicationName}", zh: "在 ${applicationName} 中添加任务" },
  "New ${applicationName} task": { de: "Neue ${applicationName}-Aufgabe", fr: "Nouvelle tâche ${applicationName}", zh: "新建 ${applicationName} 任务" },
  "What's due today in ${applicationName}": { de: "Was ist heute in ${applicationName} fällig", fr: "Qu’est-ce qui est à faire aujourd’hui dans ${applicationName}", zh: "${applicationName} 今天有什么到期" },
  "My ${applicationName} tasks for today": { de: "Meine ${applicationName}-Aufgaben für heute", fr: "Mes tâches ${applicationName} du jour", zh: "我今天的 ${applicationName} 任务" },
  "Open a page in ${applicationName}": { de: "Seite in ${applicationName} öffnen", fr: "Ouvrir une page dans ${applicationName}", zh: "在 ${applicationName} 中打开页面" },
  "Search ${applicationName}": { de: "In ${applicationName} suchen", fr: "Rechercher dans ${applicationName}", zh: "搜索 ${applicationName}" },
  "Search in ${applicationName}": { de: "Suche in ${applicationName}", fr: "Chercher dans ${applicationName}", zh: "在 ${applicationName} 中搜索" },
};

const LANGS = ["de", "en", "fr", "zh"];

// Localizable.strings entries of one language: English text → translation.
function localizable(lang) {
  return Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, lang === "en" ? key : value[lang]]));
}

module.exports = { strings, phrases, LANGS, localizable };
