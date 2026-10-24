package app.flowplan.push

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The device keys of the push relay for JavaScript (modules/flowplan-push/src/index.ts): only
 * public keys leave this module; decryption happens in FlowplanMessagingService.
 */
class FlowplanPushModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("FlowplanPush")

    Function("isAvailable") {
      true
    }

    AsyncFunction("publicKey") { profile: String, origin: String ->
      PushKeys.publicKey(context, profile, origin)
    }

    Function("deleteKey") { profile: String ->
      PushKeys.delete(context, profile)
    }

    Function("keepOnly") { profiles: List<String> ->
      PushKeys.keepOnly(context, profiles.toSet())
    }

    // iOS only (the APNs environment); FCM has none.
    Function("environment") {
      null as String?
    }
  }
}
