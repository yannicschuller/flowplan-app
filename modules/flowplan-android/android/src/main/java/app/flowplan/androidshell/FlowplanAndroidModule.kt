package app.flowplan.androidshell

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Rect
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.lang.ref.WeakReference

/**
 * Android pieces of the Flowplan app (src/android/ uses them):
 *
 * - "Share" from other apps (text, links, photos, PDFs; SEND and SEND_MULTIPLE) for the app's
 *   capture screen, copied off the main thread (ShareIntake);
 * - the dynamic app shortcuts on the launcher icon, recently opened pages among them (Shortcuts);
 * - the Material You palette for the home screen widgets (MaterialColors), their corner radii
 *   and generated previews in the widget picker (WidgetPreviews);
 * - the "Quick capture" Quick Settings tile (QuickCaptureTileService) and asking to add it;
 * - leaving for the app that shared, once its content is saved;
 * - Android 14's predictive back: while the page has a step back (setPredictiveBack), the back
 *   gesture's progress goes to the page as "onBackProgress" (start, progress, cancel, commit) so
 *   it can show what back will close; "commit" is the back itself (also for the back button);
 * - the swipe from the left edge for the page's sidebar (#285): while the page wants the edge
 *   (setLeftEdgeExclusion), a strip of the left edge is kept from the system's back gesture.
 */
class FlowplanAndroidModule : Module() {
  // The share that arrived while the app ran (onNewIntent); the one that started it is read from
  // the activity once.
  private var pending: Intent? = null
  private var initialChecked = false

  // The callback for the predictive back gesture, on the activity it was added to.
  private var backCallback: OnBackPressedCallback? = null
  private var backActivity: WeakReference<ComponentActivity>? = null
  private var backEdge = "left"

  // The strip of the left edge kept from the system's back gesture, on the window it was set on.
  private var edgeExcluded = false
  private var edgeView: WeakReference<View>? = null
  private val edgeLayout = View.OnLayoutChangeListener { view, _, _, _, _, _, _, _, _ -> applyEdgeExclusion(view) }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("FlowplanAndroid")

    Events("onShare", "onBackProgress")

    // On while the page has a step back: the gesture is then the page's (with its preview),
    // otherwise the system's (back to the launcher). Later callbacks come first, so this one
    // goes before React Native's own.
    Function("setPredictiveBack") { enabled: Boolean ->
      val activity = appContext.currentActivity as? ComponentActivity ?: return@Function false
      activity.runOnUiThread { predictiveBack(activity, enabled) }
      true
    }

    // On while the page opens its sidebar from the left edge (src/back.ts edgeExclusion): the
    // swipe there then reaches the web view instead of being the system's back. Android 10+ (the
    // rects do nothing with three-button navigation); the right edge stays the system's back.
    Function("setLeftEdgeExclusion") { enabled: Boolean ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return@Function false
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread { leftEdgeExclusion(activity.window.decorView, enabled) }
      true
    }

    OnDestroy {
      val main = Handler(Looper.getMainLooper())
      edgeView?.get()?.let { view ->
        edgeView = null
        main.post {
          view.removeOnLayoutChangeListener(edgeLayout)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) view.systemGestureExclusionRects = emptyList()
        }
      }
      val callback = backCallback ?: return@OnDestroy
      backCallback = null
      main.post { callback.remove() }
    }

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

    // The launcher's widget corner radii (Android 12+), in dp; null before.
    Function("widgetRadii") {
      WidgetPreviews.radii(context)
    }

    Function("widgetPreviewsSupported") {
      WidgetPreviews.supported()
    }

    // A widget's generated preview for the picker (Android 15+); false when rate-limited.
    AsyncFunction("setWidgetPreview") { widgetName: String, base64Png: String, description: String ->
      WidgetPreviews.set(context, widgetName, base64Png, description)
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

  /** Adds the back callback to the activity (again, when the activity is a new one) and sets it. */
  private fun predictiveBack(activity: ComponentActivity, enabled: Boolean) {
    if (backActivity?.get() !== activity) {
      backCallback?.remove()
      backCallback = null
    }
    val callback = backCallback ?: object : OnBackPressedCallback(false) {
      override fun handleOnBackStarted(backEvent: BackEventCompat) {
        backEdge = if (backEvent.swipeEdge == BackEventCompat.EDGE_RIGHT) "right" else "left"
        sendBack("start", backEvent.progress)
      }

      override fun handleOnBackProgressed(backEvent: BackEventCompat) {
        sendBack("progress", backEvent.progress)
      }

      override fun handleOnBackCancelled() {
        sendBack("cancel", 0f)
      }

      override fun handleOnBackPressed() {
        sendBack("commit", 1f)
        backEdge = "left"
      }
    }.also {
      activity.onBackPressedDispatcher.addCallback(activity, it)
      backCallback = it
      backActivity = WeakReference(activity)
    }
    callback.isEnabled = enabled
  }

  /**
   * Keeps the strip on the window's root view (again, when the activity is a new one) and follows
   * its layout – a rotation or a resized window (split screen) moves the centre.
   */
  private fun leftEdgeExclusion(view: View, enabled: Boolean) {
    val previous = edgeView?.get()
    if (previous !== view) {
      previous?.removeOnLayoutChangeListener(edgeLayout)
      if (previous != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) previous.systemGestureExclusionRects = emptyList()
      view.addOnLayoutChangeListener(edgeLayout)
      edgeView = WeakReference(view)
    }
    edgeExcluded = enabled
    applyEdgeExclusion(view)
  }

  /**
   * The strip: [EDGE_WIDTH_DP] wide at the left edge, [EDGE_HEIGHT_DP] high (Android honours at
   * most 200 dp per edge, counted from the bottom if more is asked), vertically centred.
   */
  private fun applyEdgeExclusion(view: View) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    if (!edgeExcluded || view.height <= 0) {
      if (view.systemGestureExclusionRects.isNotEmpty()) view.systemGestureExclusionRects = emptyList()
      return
    }
    val density = view.resources.displayMetrics.density
    val height = minOf(view.height, (EDGE_HEIGHT_DP * density).toInt())
    val top = (view.height - height) / 2
    val rect = Rect(0, top, (EDGE_WIDTH_DP * density).toInt(), top + height)
    if (view.systemGestureExclusionRects != listOf(rect)) view.systemGestureExclusionRects = listOf(rect)
  }

  private fun sendBack(phase: String, progress: Float) {
    sendEvent("onBackProgress", mapOf<String, Any>("phase" to phase, "progress" to progress.toDouble(), "edge" to backEdge))
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

// The strip of the left edge for the page's sidebar: as wide as the part of the edge where the
// page's swipe may begin (OPEN_EDGE in Flowplan's lib/edge-swipe.ts, CSS px = dp in the web
// view), as high as Android allows per edge.
private const val EDGE_WIDTH_DP = 64
private const val EDGE_HEIGHT_DP = 200

class ShortcutRecord : Record {
  @Field val id: String = ""
  @Field val label: String = ""
  @Field val longLabel: String = ""
  @Field val url: String = ""
  @Field val icon: String = "page"
}
