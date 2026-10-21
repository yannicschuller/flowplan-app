package app.flowplan.nativeshell

import android.app.Activity
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
 * - text and links shared from other apps ("Save to Flowplan"), for the instance's share target;
 * - the running timer of the time tracking as an ongoing notification with a running clock –
 *   Android's counterpart of the Live Activity, promoted to a Live Update on Android 16.
 */
class FlowplanNativeModule : Module() {
  private var pendingShare: Map<String, String>? = null

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("FlowplanNative")

    Events("onShare")

    Function("getManagedServer") {
      val manager = context.getSystemService(Context.RESTRICTIONS_SERVICE) as? RestrictionsManager
      manager?.applicationRestrictions?.getString("server")?.trim()?.takeIf { it.isNotEmpty() }
    }

    // A share that opened the app, once.
    Function("consumeSharedText") {
      val share = pendingShare ?: appContext.currentActivity?.let { take(it, it.intent) }
      pendingShare = null
      share
    }

    Function("showTimer") { options: TimerOptions ->
      showTimer(options)
    }

    Function("hideTimer") {
      NotificationManagerCompat.from(context).cancel(TIMER_ID)
    }

    OnNewIntent { intent ->
      val activity = appContext.currentActivity ?: return@OnNewIntent
      take(activity, intent)?.let { share ->
        pendingShare = share
        sendEvent("onShare", share)
      }
    }
  }

  /** "Teilen" with text or a link; handled once, not again after a configuration change. */
  private fun take(activity: Activity, intent: Intent?): Map<String, String>? {
    if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true) return null
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
    val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
    activity.intent = Intent(Intent.ACTION_MAIN)
    if (subject.isBlank() && text.isBlank()) return null
    return mapOf("subject" to subject, "text" to text)
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

  companion object {
    private const val TIMER_ID = 0x7100
  }
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
