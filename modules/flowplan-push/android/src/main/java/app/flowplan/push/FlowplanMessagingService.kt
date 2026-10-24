package app.flowplan.push

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * The app's only FCM service (plugins/with-push-android.js removes expo-notifications' own from
 * the manifest). A message of the push relay – data-only, its content encrypted in `fp` – is
 * decrypted here (PushKeys, PushCrypto) and handed to expo-notifications as the message it would
 * have shown, so channels, the categories' buttons (Done, Tomorrow, Reply, Mark as read), taps and
 * the JavaScript handlers work as before. Everything else (new tokens, Expo's pushes for older
 * instances) goes to expo-notifications unchanged.
 */
class FlowplanMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val payload = remoteMessage.data["fp"]
    if (payload == null) {
      super.onMessageReceived(remoteMessage)
      return
    }
    val message = PushContent.notification(applicationContext, remoteMessage, payload) ?: return
    super.onMessageReceived(message)
  }
}
