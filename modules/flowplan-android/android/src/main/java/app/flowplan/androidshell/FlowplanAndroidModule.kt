package app.flowplan.androidshell

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Android pieces of the Flowplan app (src/android/ uses them):
 *
 * - "Share" from other apps (text, links, photos, PDFs; SEND and SEND_MULTIPLE) for the app's
 *   capture screen, copied off the main thread (ShareIntake);
 * - the dynamic app shortcuts on the launcher icon, recently opened pages among them (Shortcuts);
 * - the Material You palette for the home screen widgets (MaterialColors);
 * - the "Quick capture" Quick Settings tile (QuickCaptureTileService) and asking to add it;
 * - leaving for the app that shared, once its content is saved.
 */
class FlowplanAndroidModule : Module() {
  // The share that arrived while the app ran (onNewIntent); the one that started it is read from
  // the activity once.
  private var pending: Intent? = null
  private var initialChecked = false

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("FlowplanAndroid")

    Events("onShare")

    AsyncFunction("takeShare") {
      val intent = pending ?: initialShare()
      pending = null
      intent?.let { ShareIntake.read(context, it)?.toMap() }
    }

    Function("clearShare") {
      ShareIntake.clear(context)
    }

    // Back to the app that shared (the share opened Flowplan's own task on top of it).
    Function("leave") {
      appContext.currentActivity?.let { activity -> activity.runOnUiThread { activity.moveTaskToBack(true) } }
    }

    Function("setShortcuts") { items: List<ShortcutRecord>, profile: String? ->
      Shortcuts.set(context, items.map { ShortcutItem(it.id, it.label, it.longLabel, it.url, it.icon) }, profile)
    }

    Function("reportShortcutUsed") { id: String ->
      Shortcuts.used(context, id)
    }

    Function("materialColors") {
      MaterialColors.palette(context)
    }

    // Android 13+: the system asks whether to add the tile to Quick Settings.
    Function("canAddTile") {
      Build.VERSION.SDK_INT >= 33
    }

    Function("requestAddTile") { label: String ->
      if (Build.VERSION.SDK_INT < 33) return@Function false
      val manager = context.getSystemService(StatusBarManager::class.java) ?: return@Function false
      manager.requestAddTileService(
        ComponentName(context, QuickCaptureTileService::class.java),
        label,
        Icon.createWithResource(context, R.drawable.flowplan_tile_capture),
        context.mainExecutor,
      ) {}
      true
    }

    OnNewIntent { intent ->
      if (!ShareIntake.isShare(intent)) return@OnNewIntent
      pending = intent
      sendEvent("onShare", mapOf<String, Any>())
    }
  }

  /** The intent that started the app, if it was a share; replaced so it is not read again. */
  private fun initialShare(): Intent? {
    if (initialChecked) return null
    val activity = appContext.currentActivity ?: return null
    initialChecked = true
    val intent = activity.intent
    if (!ShareIntake.isShare(intent)) return null
    activity.intent = Intent(Intent.ACTION_MAIN)
    return intent
  }
}

class ShortcutRecord : Record {
  @Field val id: String = ""
  @Field val label: String = ""
  @Field val longLabel: String = ""
  @Field val url: String = ""
  @Field val icon: String = "page"
}
