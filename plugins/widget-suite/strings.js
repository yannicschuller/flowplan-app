// The texts of the native iOS parts – the configurable widgets, controls,
// App Shortcuts and the configurable settings of the expo-widgets widgets –
// in German, French and Simplified Chinese (zh); the English text is the key (so a missing entry
// still reads as English). app.config.ts writes them into Localizable.strings
// of the app and the widget extension (locales → ios["Localizable.strings"]),
// plugins/with-widget-suite.js the phrases into AppShortcuts.strings.
// test/widget-suite-native.test.ts checks that every text of the Swift
// sources is here, in every language, with the same placeholders.

const strings = {
  // Placeholders and formats
  "%d new": { de: "%d neu", fr: "%d nouvelles", zh: "%d 条新回复" },
  "%d open": { de: "%d offen", fr: "%d ouvertes", zh: "%d 项未完成" },
  "%d unread": { de: "%d ungelesen", fr: "%d non lues", zh: "%d 条未读" },
  "%d-day streak": { de: "%d Tage in Folge", fr: "%d jours d’affilée", zh: "连续 %d 天" },
  "Saved to %@": { de: "Gesichert in %@", fr: "Enregistré dans %@", zh: "已保存到 %@" },
  "Timer started: %@": { de: "Timer gestartet: %@", fr: "Chrono démarré : %@", zh: "已开始计时：%@" },
  // Widgets, controls and their descriptions
  "Quick capture": { de: "Schnellerfassung", fr: "Saisie rapide", zh: "快速捕获" },
  "Notes, tasks, voice memos and photos in one tap.": { de: "Notizen, Aufgaben, Sprachnotizen und Fotos mit einem Tipp.", fr: "Notes, tâches, mémos vocaux et photos en un geste.", zh: "轻点一下，记录笔记、任务、语音备忘录和照片。" },
  Tasks: { de: "Aufgaben", fr: "Tâches", zh: "任务" },
  "Check off tasks right on the home screen.": { de: "Aufgaben direkt auf dem Home-Bildschirm abhaken.", fr: "Coche tes tâches directement sur l’écran d’accueil.", zh: "直接在主屏幕上勾选任务。" },
  Today: { de: "Heute", fr: "Aujourd’hui", zh: "今天" },
  "Your appointments and what is due.": { de: "Deine Termine und was fällig ist.", fr: "Tes rendez-vous et ce qui est à faire.", zh: "你的日程和到期事项。" },
  "Page and favorites": { de: "Seite und Favoriten", fr: "Page et favoris", zh: "页面与收藏" },
  "Your favorites, or one page or database view.": { de: "Deine Favoriten oder eine Seite bzw. Datenbank-Ansicht.", fr: "Tes favoris, ou une page ou une vue de base.", zh: "你的收藏，或一个页面或数据库视图。" },
  "Database counter": { de: "Datenbank-Zähler", fr: "Compteur de base", zh: "数据库计数器" },
  "One number of a database, with its last 14 days.": { de: "Eine Zahl aus einer Datenbank, mit den letzten 14 Tagen.", fr: "Un chiffre d’une base, avec ses 14 derniers jours.", zh: "数据库中的一个数字，以及它最近 14 天的变化。" },
  "Journal and habits": { de: "Tagebuch und Gewohnheiten", fr: "Journal et habitudes", zh: "日记与习惯" },
  "Today's entry and your habits to check off.": { de: "Der heutige Eintrag und deine Gewohnheiten zum Abhaken.", fr: "L’entrée du jour et tes habitudes à cocher.", zh: "今天的日记和待勾选的习惯。" },
  "Time this week": { de: "Zeit diese Woche", fr: "Temps cette semaine", zh: "本周时间" },
  "Hours this week; start and stop the timer.": { de: "Stunden dieser Woche; Timer starten und stoppen.", fr: "Heures de la semaine ; démarrer et arrêter le chrono.", zh: "本周时长；开始和停止计时器。" },
  Mentions: { de: "Erwähnungen", fr: "Mentions", zh: "提及" },
  "Who mentioned you; mark as read right away.": { de: "Wer dich erwähnt hat; gleich als gelesen markieren.", fr: "Qui t’a mentionné ; marquer comme lu tout de suite.", zh: "谁提及了你；可直接标记为已读。" },
  "Form responses": { de: "Formular-Eingänge", fr: "Réponses au formulaire", zh: "表单回复" },
  "New responses to one of your forms.": { de: "Neue Eingänge eines deiner Formulare.", fr: "Les nouvelles réponses à l’un de tes formulaires.", zh: "你的某个表单收到的新回复。" },
  "New note": { de: "Neue Notiz", fr: "Nouvelle note", zh: "新建笔记" },
  "Opens Flowplan to write a note.": { de: "Öffnet Flowplan, um eine Notiz zu schreiben.", fr: "Ouvre Flowplan pour écrire une note.", zh: "打开 Flowplan 写笔记。" },
  "Voice memo": { de: "Sprachnotiz", fr: "Mémo vocal", zh: "语音备忘录" },
  "Records a voice memo into Flowplan.": { de: "Nimmt eine Sprachnotiz für Flowplan auf.", fr: "Enregistre un mémo vocal dans Flowplan.", zh: "录制语音备忘录并存入 Flowplan。" },
  "Start focus": { de: "Fokus starten", fr: "Démarrer la concentration", zh: "开始专注" },
  "25 minutes of focus, then a break.": { de: "25 Minuten Fokus, dann eine Pause.", fr: "25 minutes de concentration, puis une pause.", zh: "专注 25 分钟，然后休息。" },
  Timer: { de: "Timer", fr: "Chrono", zh: "计时器" },
  "Starts your most recent timer or stops the running one.": { de: "Startet deinen zuletzt benutzten Timer oder stoppt den laufenden.", fr: "Démarre ton dernier chrono ou arrête celui en cours.", zh: "启动你最近使用的计时器，或停止正在运行的计时器。" },
  Running: { de: "Läuft", fr: "En cours", zh: "运行中" },
  Stopped: { de: "Gestoppt", fr: "Arrêté", zh: "已停止" },
  // Settings of the widgets
  "Save to": { de: "Speichern in", fr: "Enregistrer dans", zh: "保存到" },
  Note: { de: "Notiz", fr: "Note", zh: "笔记" },
  Task: { de: "Aufgabe", fr: "Tâche", zh: "任务" },
  Photo: { de: "Foto", fr: "Photo", zh: "照片" },
  Show: { de: "Zeigen", fr: "Afficher", zh: "显示" },
  "My tasks": { de: "Meine Aufgaben", fr: "Mes tâches", zh: "我的任务" },
  "Records of a database": { de: "Einträge einer Datenbank", fr: "Entrées d’une base", zh: "数据库中的记录" },
  "To-dos of a page": { de: "To-dos einer Seite", fr: "To-dos d’une page", zh: "页面中的待办" },
  Filter: { de: "Filter", fr: "Filtre", zh: "筛选" },
  "All open": { de: "Alle offenen", fr: "Toutes les ouvertes", zh: "所有未完成" },
  "Due today": { de: "Heute fällig", fr: "Pour aujourd’hui", zh: "今天到期" },
  Overdue: { de: "Überfällig", fr: "En retard", zh: "逾期" },
  Database: { de: "Datenbank", fr: "Base de données", zh: "数据库" },
  View: { de: "Ansicht", fr: "Vue", zh: "视图" },
  Page: { de: "Seite", fr: "Page", zh: "页面" },
  "Number of items": { de: "Anzahl", fr: "Nombre d’éléments", zh: "条目数" },
  Range: { de: "Zeitraum", fr: "Période", zh: "时间范围" },
  "Next 3 days": { de: "Nächste 3 Tage", fr: "3 prochains jours", zh: "未来 3 天" },
  "This week": { de: "Diese Woche", fr: "Cette semaine", zh: "本周" },
  Calendar: { de: "Kalender", fr: "Calendrier", zh: "日历" },
  Calendars: { de: "Kalender", fr: "Calendriers", zh: "日历" },
  "Show tasks due": { de: "Fällige Aufgaben zeigen", fr: "Afficher les tâches à faire", zh: "显示到期任务" },
  Favorites: { de: "Favoriten", fr: "Favoris", zh: "收藏" },
  "A page or database": { de: "Eine Seite oder Datenbank", fr: "Une page ou une base", zh: "页面或数据库" },
  "First property": { de: "Erste Eigenschaft", fr: "Première propriété", zh: "第一个属性" },
  "Second property": { de: "Zweite Eigenschaft", fr: "Deuxième propriété", zh: "第二个属性" },
  Property: { de: "Eigenschaft", fr: "Propriété", zh: "属性" },
  Value: { de: "Wert", fr: "Valeur", zh: "值" },
  "Number of records": { de: "Anzahl der Einträge", fr: "Nombre d’entrées", zh: "记录数" },
  Sum: { de: "Summe", fr: "Somme", zh: "总和" },
  Average: { de: "Durchschnitt", fr: "Moyenne", zh: "平均值" },
  "Number property": { de: "Zahl-Eigenschaft", fr: "Propriété numérique", zh: "数字属性" },
  "Only one group": { de: "Nur eine Gruppe", fr: "Un seul groupe", zh: "仅一个分组" },
  "Group value": { de: "Wert der Gruppe", fr: "Valeur du groupe", zh: "分组值" },
  "History of the last 14 days": { de: "Verlauf der letzten 14 Tage", fr: "Historique des 14 derniers jours", zh: "最近 14 天的历史" },
  Journal: { de: "Journal", fr: "Journal", zh: "日记" },
  Habits: { de: "Gewohnheiten", fr: "Habitudes", zh: "习惯" },
  Habit: { de: "Gewohnheit", fr: "Habitude", zh: "习惯" },
  "Timer for “Start”": { de: "Timer für „Starten“", fr: "Chrono pour « Démarrer »", zh: "“开始”使用的计时器" },
  "Mentions and new tasks": { de: "Erwähnungen und neue Aufgaben", fr: "Mentions et nouvelles tâches", zh: "提及和新任务" },
  "New tasks for me": { de: "Neue Aufgaben für mich", fr: "Nouvelles tâches pour moi", zh: "分配给我的新任务" },
  "Unread only": { de: "Nur ungelesene", fr: "Non lues seulement", zh: "仅未读" },
  Form: { de: "Formular", fr: "Formulaire", zh: "表单" },
  // Parameters of the buttons (not shown, but named)
  Source: { de: "Quelle", fr: "Source", zh: "来源" },
  Record: { de: "Eintrag", fr: "Entrée", zh: "记录" },
  Position: { de: "Position", fr: "Position", zh: "位置" },
  Text: { de: "Text", fr: "Texte", zh: "文本" },
  Key: { de: "Schlüssel", fr: "Clé", zh: "键" },
  Link: { de: "Link", fr: "Lien", zh: "链接" },
  Notification: { de: "Mitteilung", fr: "Notification", zh: "通知" },
  Done: { de: "Erledigt", fr: "Fait", zh: "已完成" },
  Open: { de: "Offen", fr: "Ouvert", zh: "未完成" },
  Minutes: { de: "Minuten", fr: "Minutes", zh: "分钟" },
  // What the widgets show
  "Mark as done": { de: "Als erledigt markieren", fr: "Marquer comme terminée", zh: "标记为完成" },
  "Check off habit": { de: "Gewohnheit abhaken", fr: "Cocher l’habitude", zh: "勾选习惯" },
  "Mark as read": { de: "Als gelesen markieren", fr: "Marquer comme lu", zh: "标记为已读" },
  "Mark all read": { de: "Alle als gelesen markieren", fr: "Tout marquer comme lu", zh: "全部标为已读" },
  "Start timer": { de: "Timer starten", fr: "Démarrer le chrono", zh: "开始计时" },
  "Stop timer": { de: "Timer stoppen", fr: "Arrêter le chrono", zh: "停止计时" },
  "Open Flowplan": { de: "Flowplan öffnen", fr: "Ouvrir Flowplan", zh: "打开 Flowplan" },
  "Open Flowplan to sign in": { de: "Flowplan öffnen und anmelden", fr: "Ouvre Flowplan pour te connecter", zh: "打开 Flowplan 登录" },
  "Edit the widget and choose a page": { de: "Widget bearbeiten und eine Seite wählen", fr: "Modifie le widget et choisis une page", zh: "编辑小组件并选择一个页面" },
  "No longer available – edit the widget": { de: "Nicht mehr verfügbar – Widget bearbeiten", fr: "Plus disponible – modifie le widget", zh: "已不可用 – 请编辑小组件" },
  "Can’t be reached right now": { de: "Gerade nicht erreichbar", fr: "Injoignable pour le moment", zh: "暂时无法访问" },
  // A button the instance refused: shown at the item until the next refresh.
  "Couldn’t check off – open in Flowplan": { de: "Konnte nicht abhaken – in Flowplan öffnen", fr: "Impossible de cocher – ouvre dans Flowplan", zh: "无法勾选 – 请在 Flowplan 中打开" },
  "Didn’t work – open Flowplan": { de: "Hat nicht geklappt – Flowplan öffnen", fr: "Échec – ouvre Flowplan", zh: "操作失败 – 请打开 Flowplan" },
  "Protected by the journal PIN – unlock it in Flowplan": { de: "Mit Journal-PIN geschützt – in Flowplan entsperren", fr: "Protégé par le code du journal – déverrouille-le dans Flowplan", zh: "受日记 PIN 保护 – 请在 Flowplan 中解锁" },
  "End-to-end encrypted – readable in Flowplan only": { de: "Ende-zu-Ende-verschlüsselt – nur in Flowplan lesbar", fr: "Chiffré de bout en bout – lisible uniquement dans Flowplan", zh: "端到端加密 – 只能在 Flowplan 中查看" },
  Locked: { de: "Gesperrt", fr: "Verrouillé", zh: "已锁定" },
  Encrypted: { de: "Verschlüsselt", fr: "Chiffré", zh: "已加密" },
  Untitled: { de: "Ohne Titel", fr: "Sans titre", zh: "未命名" },
  "All done": { de: "Alles erledigt", fr: "Tout est fait", zh: "全部完成" },
  "All day": { de: "Ganztägig", fr: "Toute la journée", zh: "全天" },
  "Nothing scheduled": { de: "Keine Termine", fr: "Rien de prévu", zh: "没有安排" },
  "Nothing here yet": { de: "Noch keine Einträge", fr: "Rien ici pour l’instant", zh: "这里还没有内容" },
  "History partly estimated": { de: "Verlauf zum Teil geschätzt", fr: "Historique en partie estimé", zh: "历史数据部分为估算" },
  "Written today": { de: "Heute geschrieben", fr: "Écrit aujourd’hui", zh: "今天已写" },
  "Write today": { de: "Heute schreiben", fr: "Écrire aujourd’hui", zh: "写今天的日记" },
  "Start a timer in Flowplan": { de: "Starte einen Timer in Flowplan", fr: "Lance un chrono dans Flowplan", zh: "在 Flowplan 中开始计时" },
  "No new mentions": { de: "Keine neuen Erwähnungen", fr: "Aucune nouvelle mention", zh: "没有新的提及" },
  "No new responses": { de: "Keine neuen Eingänge", fr: "Aucune nouvelle réponse", zh: "没有新的回复" },
  new: { de: "neu", fr: "nouvelles", zh: "条新回复" },
  Tomorrow: { de: "Morgen", fr: "Demain", zh: "明天" },
  Yesterday: { de: "Gestern", fr: "Hier", zh: "昨天" },
  // App Shortcuts and Siri
  "Add a note": { de: "Notiz hinzufügen", fr: "Ajouter une note", zh: "添加笔记" },
  "Saves a note to your Flowplan capture inbox.": { de: "Sichert eine Notiz im Erfassungs-Eingang von Flowplan.", fr: "Enregistre une note dans la boîte de saisie de Flowplan.", zh: "将笔记保存到 Flowplan 的捕获收件箱。" },
  "What should the note say?": { de: "Was soll in der Notiz stehen?", fr: "Que doit dire la note ?", zh: "笔记要写什么？" },
  "Nowhere to capture to. Create a database in Flowplan.": { de: "Kein Ziel zum Erfassen. Lege in Flowplan eine Datenbank an.", fr: "Aucune destination. Crée une base de données dans Flowplan.", zh: "没有可保存的位置。请在 Flowplan 中创建一个数据库。" },
  "What's on today?": { de: "Was steht heute an?", fr: "Qu’est-ce qui est prévu aujourd’hui ?", zh: "今天有什么安排？" },
  "Today's appointments and tasks due.": { de: "Die Termine von heute und fällige Aufgaben.", fr: "Les rendez-vous du jour et les tâches à faire.", zh: "今天的日程和到期任务。" },
  "Starts your most recent timer again.": { de: "Startet deinen zuletzt benutzten Timer wieder.", fr: "Relance ton dernier chrono.", zh: "重新启动你最近使用的计时器。" },
  "Stops the running timer.": { de: "Stoppt den laufenden Timer.", fr: "Arrête le chrono en cours.", zh: "停止正在运行的计时器。" },
  "Timer stopped": { de: "Timer gestoppt", fr: "Chrono arrêté", zh: "计时器已停止" },
  "Record a voice memo": { de: "Sprachnotiz aufnehmen", fr: "Enregistrer un mémo vocal", zh: "录制语音备忘录" },
  "Opens Flowplan and starts recording.": { de: "Öffnet Flowplan und startet die Aufnahme.", fr: "Ouvre Flowplan et lance l’enregistrement.", zh: "打开 Flowplan 并开始录音。" },
  // Made-up content of the widget gallery
  Inbox: { de: "Eingang", fr: "Boîte d’entrée", zh: "收件箱" },
  "Send offer to Miller": { de: "Angebot an Müller senden", fr: "Envoyer l’offre à Martin", zh: "给王磊发送报价" },
  "Prepare the retro": { de: "Retro vorbereiten", fr: "Préparer la rétro", zh: "准备回顾会" },
  "Submit travel expenses": { de: "Reisekosten abrechnen", fr: "Note de frais du voyage", zh: "报销差旅费" },
  "Review website copy": { de: "Website-Texte prüfen", fr: "Relire les textes du site", zh: "审阅网站文案" },
  Sales: { de: "Vertrieb", fr: "Ventes", zh: "销售" },
  Team: { de: "Team", fr: "Équipe", zh: "团队" },
  Finance: { de: "Finanzen", fr: "Finances", zh: "财务" },
  Marketing: { de: "Marketing", fr: "Marketing", zh: "市场" },
  "Stand-up": { de: "Standup", fr: "Point d’équipe", zh: "站会" },
  "Client meeting Miller": { de: "Kundentermin Müller", fr: "Rendez-vous client Martin", zh: "与王磊的客户会议" },
  "Weekly plan": { de: "Wochenplan", fr: "Plan de la semaine", zh: "周计划" },
  "Website relaunch": { de: "Website-Relaunch", fr: "Refonte du site", zh: "网站改版" },
  Brainstorming: { de: "Brainstorming", fr: "Remue-méninges", zh: "头脑风暴" },
  Applications: { de: "Bewerbungen", fr: "Candidatures", zh: "求职申请" },
  Records: { de: "Einträge", fr: "Entrées", zh: "记录" },
  "My journal": { de: "Mein Journal", fr: "Mon journal", zh: "我的日记" },
  Run: { de: "Laufen", fr: "Courir", zh: "跑步" },
  Read: { de: "Lesen", fr: "Lire", zh: "阅读" },
  "No sugar": { de: "Kein Zucker", fr: "Sans sucre", zh: "不吃糖" },
  "Write offer": { de: "Angebot schreiben", fr: "Rédiger l’offre", zh: "撰写报价" },
  Projects: { de: "Projekte", fr: "Projets", zh: "项目" },
  "Ada mentioned you in “Roadmap”": { de: "Ada hat dich in „Roadmap“ erwähnt", fr: "Ada t’a mentionné dans « Roadmap »", zh: "Ada 在“Roadmap”中提及了你" },
  "Ben gave you “Prepare the retro”": { de: "Ben hat dir „Retro vorbereiten“ gegeben", fr: "Ben t’a confié « Préparer la rétro »", zh: "Ben 把“准备回顾会”分配给了你" },
  "Contact form": { de: "Kontaktformular", fr: "Formulaire de contact", zh: "联系表单" },
};

// Settings of the expo-widgets widgets (app.config.ts → ios.configuration;
// expo-widgets writes them into Swift as English text, "<title>
// Configuration" is the settings' title).
Object.assign(strings, {
  "Flowplan Configuration": { de: "Flowplan-Einstellungen", fr: "Réglages Flowplan", zh: "Flowplan 设置" },
  "Flowplan Instance Configuration": { de: "Einstellungen Flowplan Instanz", fr: "Réglages Flowplan Instance", zh: "Flowplan 实例设置" },
  "Flowplan Live Configuration": { de: "Einstellungen Flowplan Live", fr: "Réglages Flowplan Live", zh: "Flowplan 实时设置" },
  "Flowplan Storage Configuration": { de: "Einstellungen Flowplan Speicher", fr: "Réglages Flowplan Stockage", zh: "Flowplan 存储设置" },
  "Tasks and inbox": { de: "Aufgaben und Posteingang", fr: "Tâches et boîte de réception", zh: "任务和收件箱" },
  "Tasks only": { de: "Nur Aufgaben", fr: "Tâches seulement", zh: "仅任务" },
  "Running timer": { de: "Laufende Zeiterfassung", fr: "Chrono en cours", zh: "正在运行的计时器" },
  State: { de: "Zustand", fr: "État", zh: "状态" },
  "Last backup": { de: "Letzte Sicherung", fr: "Dernière sauvegarde", zh: "上次备份" },
  Version: { de: "Version", fr: "Version", zh: "版本" },
  Metric: { de: "Kennzahl", fr: "Indicateur", zh: "指标" },
  "Active now": { de: "Gerade aktiv", fr: "Actifs maintenant", zh: "当前活跃" },
  "Requests/min": { de: "Anfragen/Min.", fr: "Requêtes/min", zh: "请求/分钟" },
  "Error rate (1 h)": { de: "Fehlerrate (1 Std.)", fr: "Taux d’erreur (1 h)", zh: "错误率（1 小时）" },
  "Sign-ins today": { de: "Anmeldungen heute", fr: "Connexions aujourd’hui", zh: "今日登录" },
  "Disk used": { de: "Festplatte belegt", fr: "Disque utilisé", zh: "磁盘已用" },
  "Database and files": { de: "Datenbank und Dateien", fr: "Base de données et fichiers", zh: "数据库和文件" },
  "Fullest workspace": { de: "Vollster Arbeitsbereich", fr: "Espace le plus plein", zh: "最满的工作区" },
});

// Siri and Shortcuts phrases (AppShortcuts.strings).
const phrases = {
  "Add a note to ${applicationName}": { de: "Notiz zu ${applicationName} hinzufügen", fr: "Ajouter une note à ${applicationName}", zh: "在 ${applicationName} 中添加笔记" },
  "New ${applicationName} note": { de: "Neue ${applicationName}-Notiz", fr: "Nouvelle note ${applicationName}", zh: "新建 ${applicationName} 笔记" },
  "What's on today in ${applicationName}": { de: "Was steht heute in ${applicationName} an", fr: "Qu’est-ce qui est prévu aujourd’hui dans ${applicationName}", zh: "${applicationName} 今天有什么安排" },
  "What's on today with ${applicationName}": { de: "Was steht heute an mit ${applicationName}", fr: "Mon programme du jour avec ${applicationName}", zh: "用 ${applicationName} 查看今天的安排" },
  "Start the timer in ${applicationName}": { de: "Timer in ${applicationName} starten", fr: "Démarrer le chrono dans ${applicationName}", zh: "在 ${applicationName} 中开始计时" },
  "Start a ${applicationName} timer": { de: "${applicationName}-Timer starten", fr: "Lancer un chrono ${applicationName}", zh: "启动 ${applicationName} 计时器" },
  "Stop the timer in ${applicationName}": { de: "Timer in ${applicationName} stoppen", fr: "Arrêter le chrono dans ${applicationName}", zh: "在 ${applicationName} 中停止计时" },
  "Record a voice memo in ${applicationName}": { de: "Sprachnotiz in ${applicationName} aufnehmen", fr: "Enregistrer un mémo vocal dans ${applicationName}", zh: "在 ${applicationName} 中录制语音备忘录" },
  "Start focus in ${applicationName}": { de: "Fokus in ${applicationName} starten", fr: "Démarrer la concentration dans ${applicationName}", zh: "在 ${applicationName} 中开始专注" },
};

// The widget gallery on Android (labels and descriptions; iOS takes them
// from Localizable.strings above, keyed by the English text).
const gallery = {
  FlowplanTasks: { label: ["Übersicht", "Overview", "Aperçu", "概览"], description: ["Fällige und offene Aufgaben, Posteingang und Timer auf einen Blick. Zum Abhaken das Widget „Aufgaben“ hinzufügen.", "Due and open tasks, inbox and timer at a glance. To check off tasks, add the “Tasks” widget.", "Tâches à faire, boîte de réception et chrono en un coup d’œil. Pour cocher, ajoute le widget « Tâches ».", "一览到期和未完成的任务、收件箱和计时器。要勾选任务，请添加“任务”小组件。"] },
  FlowplanInbox: { label: ["Flowplan Posteingang", "Flowplan Inbox", "Flowplan Boîte de réception", "Flowplan 收件箱"], description: ["Ungelesene Mitteilungen.", "Unread notifications.", "Notifications non lues.", "未读通知。"] },
  FlowplanInstance: { label: ["Flowplan Instanz", "Flowplan Instance", "Flowplan Instance", "Flowplan 实例"], description: ["Für Administratoren: Zustand, Version und letzte Sicherung.", "For administrators: state, version and last backup.", "Pour les administrateurs : état, version et dernière sauvegarde.", "供管理员使用：状态、版本和上次备份。"] },
  FlowplanLive: { label: ["Flowplan Live", "Flowplan Live", "Flowplan Live", "Flowplan 实时"], description: ["Für Administratoren: eine Live-Zahl der Instanz.", "For administrators: one live number of the instance.", "Pour les administrateurs : un chiffre en direct de l’instance.", "供管理员使用：实例的一项实时数据。"] },
  FlowplanStorage: { label: ["Flowplan Speicher", "Flowplan Storage", "Flowplan Stockage", "Flowplan 存储"], description: ["Für Administratoren: Speicher, Festplatte und Kontingente.", "For administrators: storage, disk and quotas.", "Pour les administrateurs : stockage, disque et quotas.", "供管理员使用：存储、磁盘和配额。"] },
  FlowplanCapture: { label: ["Schnellerfassung", "Quick capture", "Saisie rapide", "快速捕获"], description: ["Notizen, Aufgaben, Sprachnotizen und Fotos mit einem Tipp.", "Notes, tasks, voice memos and photos in one tap.", "Notes, tâches, mémos vocaux et photos en un geste.", "轻点一下，记录笔记、任务、语音备忘录和照片。"] },
  FlowplanTaskList: { label: ["Aufgaben", "Tasks", "Tâches", "任务"], description: ["Aufgaben direkt auf dem Home-Bildschirm abhaken.", "Check off tasks right on the home screen.", "Coche tes tâches directement sur l’écran d’accueil.", "直接在主屏幕上勾选任务。"] },
  FlowplanAgenda: { label: ["Heute", "Today", "Aujourd’hui", "今天"], description: ["Deine Termine und was fällig ist.", "Your appointments and what is due.", "Tes rendez-vous et ce qui est à faire.", "你的日程和到期事项。"] },
  FlowplanPinned: { label: ["Seite und Favoriten", "Page and favorites", "Page et favoris", "页面与收藏"], description: ["Deine Favoriten oder eine Seite bzw. Datenbank-Ansicht.", "Your favorites, or one page or database view.", "Tes favoris, ou une page ou une vue de base.", "你的收藏，或一个页面或数据库视图。"] },
  FlowplanCounter: { label: ["Datenbank-Zähler", "Database counter", "Compteur de base", "数据库计数器"], description: ["Eine Zahl aus einer Datenbank, mit den letzten 14 Tagen.", "One number of a database, with its last 14 days.", "Un chiffre d’une base, avec ses 14 derniers jours.", "数据库中的一个数字，以及它最近 14 天的变化。"] },
  FlowplanJournal: { label: ["Tagebuch und Gewohnheiten", "Journal and habits", "Journal et habitudes", "日记与习惯"], description: ["Der heutige Eintrag und deine Gewohnheiten zum Abhaken.", "Today’s entry and your habits to check off.", "L’entrée du jour et tes habitudes à cocher.", "今天的日记和待勾选的习惯。"] },
  FlowplanTime: { label: ["Zeit diese Woche", "Time this week", "Temps cette semaine", "本周时间"], description: ["Stunden dieser Woche; Timer starten und stoppen.", "Hours this week; start and stop the timer.", "Heures de la semaine ; démarrer et arrêter le chrono.", "本周时长；开始和停止计时器。"] },
  FlowplanMentions: { label: ["Erwähnungen", "Mentions", "Mentions", "提及"], description: ["Wer dich erwähnt hat; gleich als gelesen markieren.", "Who mentioned you; mark as read right away.", "Qui t’a mentionné ; marquer comme lu tout de suite.", "谁提及了你；可直接标记为已读。"] },
  FlowplanForms: { label: ["Formular-Eingänge", "Form responses", "Réponses au formulaire", "表单回复"], description: ["Neue Eingänge eines deiner Formulare.", "New responses to one of your forms.", "Les nouvelles réponses à l’un de tes formulaires.", "你的某个表单收到的新回复。"] },
};

const LANGS = ["de", "en", "fr", "zh"];
// The .lproj folder of a language: Simplified Chinese is zh-Hans on iOS
// (app.config.ts → locales, CFBundleLocalizations).
const lproj = (lang) => (lang === "zh" ? "zh-Hans" : lang);

// Android string resources of the gallery for one language.
function galleryStrings(lang) {
  const index = { de: 0, en: 1, fr: 2, zh: 3 }[lang];
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
  const index = { de: 0, en: 1, fr: 2, zh: 3 }[lang];
  for (const entry of Object.values(gallery)) {
    out[entry.label[1]] ??= entry.label[index];
    out[entry.description[1]] ??= entry.description[index];
  }
  return out;
}

module.exports = { strings, phrases, gallery, galleryStrings, LANGS, lproj, localizable };
