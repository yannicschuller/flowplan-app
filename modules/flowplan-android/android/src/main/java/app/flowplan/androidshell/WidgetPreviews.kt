package app.flowplan.androidshell

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import android.widget.RemoteViews

/**
 * The home screen widgets' look on this device and in the widget picker:
 *
 * - the corner radii of Material 3 widgets (Android 12+: the launcher's
 *   system_app_widget_background_radius and system_app_widget_inner_radius), in dp;
 * - generated previews (Android 15+, AppWidgetManager.setWidgetPreview): the widget drawn with
 *   sample content in the person's language and colours – react-native-android-widget renders
 *   it (its createPreview), this puts the picture into the picker. The system rate-limits the
 *   call (false: try again later). Providers are react-native-android-widget's
 *   "<package>.widget.<name>".
 *
 * Adding a widget from the app is react-native-android-widget's requestPinWidget.
 */
object WidgetPreviews {
  fun radii(context: Context): Map<String, Double>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
    return try {
      val density = context.resources.displayMetrics.density
      val background = context.resources.getDimension(android.R.dimen.system_app_widget_background_radius) / density
      val inner = context.resources.getDimension(android.R.dimen.system_app_widget_inner_radius) / density
      mapOf("background" to background.toDouble(), "inner" to inner.toDouble())
    } catch (_: Exception) {
      null
    }
  }

  fun supported() = Build.VERSION.SDK_INT >= 35

  fun set(context: Context, widgetName: String, base64Png: String, description: String): Boolean {
    if (Build.VERSION.SDK_INT < 35) return false
    if (!Regex("^[A-Za-z0-9_]{1,64}$").matches(widgetName)) return false
    val manager = AppWidgetManager.getInstance(context) ?: return false
    val provider = ComponentName(context.packageName, "${context.packageName}.widget.$widgetName")
    if (manager.getInstalledProvidersForPackage(context.packageName, null).none { it.provider == provider }) return false
    val bytes = try {
      Base64.decode(base64Png, Base64.DEFAULT)
    } catch (_: IllegalArgumentException) {
      return false
    }
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return false
    // RemoteViews carry their bitmaps across processes: kept small.
    val scale = minOf(1f, MAX_PREVIEW_PX / maxOf(decoded.width, decoded.height).toFloat())
    val bitmap =
      if (scale < 1f) {
        Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt().coerceAtLeast(1), (decoded.height * scale).toInt().coerceAtLeast(1), true)
      } else {
        decoded
      }
    val views = RemoteViews(context.packageName, R.layout.flowplan_widget_preview)
    views.setImageViewBitmap(R.id.flowplan_widget_preview_image, bitmap)
    views.setContentDescription(R.id.flowplan_widget_preview_image, description)
    return try {
      manager.setWidgetPreview(provider, AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN, views)
    } catch (_: Exception) {
      false
    }
  }
}

private const val MAX_PREVIEW_PX = 720f
