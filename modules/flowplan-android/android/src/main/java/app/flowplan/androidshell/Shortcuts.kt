package app.flowplan.androidshell

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri

/** One app shortcut: its id, texts, the app link it opens and an icon of this module. */
data class ShortcutItem(val id: String, val label: String, val longLabel: String, val url: String, val icon: String)

/**
 * The dynamic app shortcuts on the launcher icon (long press). The static ones ("New note",
 * "Quick capture") come from res/xml/flowplan_shortcuts.xml (plugins/with-android-extras.js).
 * Recently opened pages carry the profile in their id ("page:<profile>:<page>"): pinned ones
 * of another profile are disabled while it is not active, since their link would open in the
 * active one.
 */
object Shortcuts {
  private val ICONS = mapOf(
    "page" to R.drawable.flowplan_shortcut_page,
    "database" to R.drawable.flowplan_shortcut_database,
    "inbox" to R.drawable.flowplan_shortcut_inbox,
    "tasks" to R.drawable.flowplan_shortcut_tasks,
    "search" to R.drawable.flowplan_shortcut_search,
    "voice" to R.drawable.flowplan_shortcut_voice,
    "profile" to R.drawable.flowplan_shortcut_profile,
    "note" to R.drawable.flowplan_shortcut_note,
    "capture" to R.drawable.flowplan_shortcut_capture,
  )

  private fun manager(context: Context) = context.getSystemService(ShortcutManager::class.java)

  private fun intent(context: Context, url: String): Intent {
    val safe = if (url.startsWith("flowplan://")) url else "flowplan://open?path=%2F"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(safe)).setPackage(context.packageName)
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.component?.let { intent.component = it }
    return intent
  }

  private fun info(context: Context, item: ShortcutItem, rank: Int): ShortcutInfo =
    ShortcutInfo.Builder(context, item.id)
      .setShortLabel(item.label.ifBlank { "Flowplan" }.take(25))
      .setLongLabel(item.longLabel.ifBlank { item.label }.ifBlank { "Flowplan" }.take(50))
      .setIcon(Icon.createWithResource(context, ICONS[item.icon] ?: R.drawable.flowplan_shortcut_page))
      .setIntent(intent(context, item.url))
      .setRank(rank)
      .build()

  /** Replaces the dynamic shortcuts (in this order); returns false when Android refused. */
  fun set(context: Context, items: List<ShortcutItem>, profile: String?): Boolean {
    val manager = manager(context) ?: return false
    return try {
      val room = (manager.maxShortcutCountPerActivity - manager.manifestShortcuts.size).coerceAtLeast(0)
      val infos = items.distinctBy { it.id }.take(room).mapIndexed { rank, item -> info(context, item, rank) }
      if (!manager.setDynamicShortcuts(infos)) return false
      // Pinned copies on the home screen keep their texts up to date …
      val pinned = manager.pinnedShortcuts.map { it.id }.toSet()
      infos.filter { it.id in pinned }.takeIf { it.isNotEmpty() }?.let { manager.updateShortcuts(it) }
      // … and pages of another profile (or signed out: all) wait until it is active again.
      val pages = pinned.filter { it.startsWith("page:") }
      val own = if (profile.isNullOrEmpty()) emptyList() else pages.filter { it.startsWith("page:$profile:") }
      if (own.isNotEmpty()) manager.enableShortcuts(own)
      val others = pages - own.toSet()
      if (others.isNotEmpty()) manager.disableShortcuts(others)
      true
    } catch (_: Exception) {
      // Rate limited in the background, or the launcher is busy: next time.
      false
    }
  }

  /** The launcher ranks shortcuts by use; links that were opened another way count too. */
  fun used(context: Context, id: String) {
    try {
      manager(context)?.reportShortcutUsed(id)
    } catch (_: Exception) {}
  }
}
