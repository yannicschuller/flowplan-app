package app.flowplan.nativeshell

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.RestrictionsManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * What the Flowplan app needs from Android beyond Expo's modules:
 *
 * - the address a managed installation suggests (EMM app restrictions, key "server");
 * - the running timer of the time tracking as an ongoing notification with a running clock –
 *   Android's counterpart of the Live Activity, promoted to a Live Update on Android 16;
 * - the same for what else runs now: focus, the meeting now, imports and exports, a voice
 *   memo being recorded, an incident of the instance (src/native/activities.ts);
 * - "New note" as a Quick Settings tile (CaptureTileService).
 *
 * "Share" from other apps, the app shortcuts and "Quick capture" are modules/flowplan-android's.
 */
class FlowplanNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("FlowplanNative")

    Function("getManagedServer") {
      val manager = context.getSystemService(Context.RESTRICTIONS_SERVICE) as? RestrictionsManager
      manager?.applicationRestrictions?.getString("server")?.trim()?.takeIf { it.isNotEmpty() }
    }

    Function("showTimer") { options: TimerOptions ->
      showTimer(options)
    }

    Function("hideTimer") {
      NotificationManagerCompat.from(context).cancel(TIMER_ID)
    }

    Function("showOngoing") { options: OngoingOptions ->
      showOngoing(options)
    }

    Function("hideOngoing") { id: String ->
      NotificationManagerCompat.from(context).cancel(ongoingId(id))
    }
  }

  private fun showTimer(options: TimerOptions) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Every time, not only the first: Android keeps a channel's name and
      // description as last created, so this follows the app's language
      // (sync.ts passes the current texts). Importance and the user's own
      // settings stay as they are.
      manager.createNotificationChannel(
        NotificationChannel(options.channelId, options.channelName, NotificationManager.IMPORTANCE_LOW).apply {
          description = options.channelDescription
          setShowBadge(false)
        }
      )
    }
    val open = Intent(Intent.ACTION_VIEW, Uri.parse(options.url)).setPackage(context.packageName)
    val contentIntent = PendingIntent.getActivity(
      context,
      TIMER_ID,
      open,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    val color = context.resources.getIdentifier("notification_icon_color", "color", context.packageName)
    val builder = NotificationCompat.Builder(context, options.channelId)
      .setSmallIcon(icon)
      .setContentTitle(options.title)
      .setContentText(options.text)
      .setSubText(options.label)
      .setWhen(options.start.toLong())
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setContentIntent(contentIntent)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    if (color != 0) builder.setColor(context.getColor(color))
    val notification = builder.build()
    // Android 16: a Live Update in the status bar chip and on the lock screen.
    if (Build.VERSION.SDK_INT >= 36) notification.extras.putBoolean("android.requestPromotedOngoing", true)
    try {
      NotificationManagerCompat.from(context).notify(TIMER_ID, notification)
    } catch (_: SecurityException) {
      // Notifications not allowed: the timer simply shows in the app.
    }
  }

  private fun ongoingId(id: String) = ONGOING_BASE + (id.hashCode() and 0xff)

  /** Opens the app with one of its own links (flowplan://…), from a notification. */
  private fun linkIntent(url: String, request: Int): PendingIntent {
    val safe = if (url.startsWith("flowplan://")) url else "flowplan://open?path=%2F"
    val open = Intent(Intent.ACTION_VIEW, Uri.parse(safe)).setPackage(context.packageName)
    return PendingIntent.getActivity(context, request, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun showOngoing(options: OngoingOptions) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(options.channelId, options.channelName, NotificationManager.IMPORTANCE_LOW).apply {
          description = options.channelDescription
          setShowBadge(false)
        }
      )
    }
    val id = ongoingId(options.id)
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    val color = context.resources.getIdentifier("notification_icon_color", "color", context.packageName)
    val builder = NotificationCompat.Builder(context, options.channelId)
      .setSmallIcon(icon)
      .setContentTitle(options.title)
      .setContentText(options.text)
      .setSubText(options.label)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setContentIntent(linkIntent(options.url, id))
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    // A clock up from start, or down to end.
    when {
      options.end > 0 -> builder.setWhen(options.end.toLong()).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
      options.start > 0 -> builder.setWhen(options.start.toLong()).setShowWhen(true).setUsesChronometer(true)
      else -> builder.setShowWhen(false)
    }
    // A bar: 0–100, or moving without an estimate (-1).
    if (options.progress >= 0) builder.setProgress(100, options.progress.toInt().coerceIn(0, 100), false)
    else if (options.progress > -2 && options.progress < 0) builder.setProgress(0, 0, true)
    options.actions.take(2).forEachIndexed { index, action ->
      builder.addAction(0, action.label, linkIntent(action.url, id * 4 + index + 1))
    }
    if (color != 0) builder.setColor(context.getColor(color))
    val notification = builder.build()
    // Android 16: a Live Update in the status bar chip and on the lock screen.
    if (Build.VERSION.SDK_INT >= 36) notification.extras.putBoolean("android.requestPromotedOngoing", true)
    try {
      NotificationManagerCompat.from(context).notify(id, notification)
    } catch (_: SecurityException) {
      // Notifications not allowed: it shows in the app only.
    }
  }

  companion object {
    private const val TIMER_ID = 0x7100
    private const val ONGOING_BASE = 0x7200
  }
}

class OngoingAction : Record {
  @Field val label: String = ""
  @Field val url: String = ""
}

class OngoingOptions : Record {
  @Field val id: String = ""
  @Field val channelId: String = "activities"
  @Field val channelName: String = "Ongoing activities"
  @Field val channelDescription: String = ""
  @Field val title: String = ""
  @Field val text: String = ""
  @Field val label: String = ""
  @Field val url: String = ""
  @Field val start: Double = 0.0
  @Field val end: Double = 0.0
  // Left out: no bar (-2); -1: indeterminate.
  @Field val progress: Double = -2.0
  @Field val actions: List<OngoingAction> = emptyList()
}

class TimerOptions : Record {
  @Field val title: String = ""
  @Field val text: String = ""
  @Field val label: String = ""
  @Field val start: Double = 0.0
  @Field val url: String = ""
  @Field val channelId: String = "timer"
  @Field val channelName: String = "Time tracking"
  @Field val channelDescription: String = ""
}
