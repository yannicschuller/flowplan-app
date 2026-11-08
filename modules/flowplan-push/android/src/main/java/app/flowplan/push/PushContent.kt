package app.flowplan.push

import android.content.Context
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONException
import org.json.JSONObject
import java.net.URI
import java.net.URISyntaxException
import java.util.UUID

/**
 * A relay message, decrypted and checked (the same rules as parsePlaintext in src/push-relay.ts),
 * turned into the data-only message expo-notifications shows: title, text, channel "inbox", the
 * category with its buttons, the data the app reads (body: url, notificationId, origin), collapse
 * tag and badge. What does not decrypt or check out becomes a placeholder without buttons or link.
 */
internal object PushContent {
  // PROTOCOL.md §6.9: older messages are not shown.
  private const val MAX_AGE = 7L * 86_400L
  private const val MAX_SKEW = 86_400L
  // 1–128 characters without control characters (it travels as JSON only).
  private val ID = Regex("^[^\\u0000-\\u001f\\u007f\\u2028\\u2029]{1,128}$")
  private val TAG = Regex("^[A-Za-z0-9_.:-]{1,64}$")
  private val BADGE = Regex("^\\d{1,4}$")
  private val CATEGORIES = mapOf(
    "task" to "flowplan.task",
    "comment" to "flowplan.comment",
    "read" to "flowplan.read",
    "approval" to "flowplan.workflow-approval",
    "flowplan.task" to "flowplan.task",
    "flowplan.comment" to "flowplan.comment",
    "flowplan.read" to "flowplan.read",
    "flowplan.workflow-approval" to "flowplan.workflow-approval",
  )

  class Message(val title: String, val body: String, val path: String?, val id: String, val category: String?, val data: JSONObject?)

  fun parse(plaintext: ByteArray, origin: String, nowSeconds: Long): Message? {
    val json = try {
      JSONObject(String(plaintext, Charsets.UTF_8))
    } catch (e: JSONException) {
      return null
    }
    val title = json.opt("title") as? String ?: return null
    val body = json.opt("body") as? String ?: return null
    val id = json.opt("id") as? String ?: return null
    if (!ID.matches(id)) return null
    val sentAt = (json.opt("sentAt") as? Number)?.toDouble() ?: return null
    if (sentAt.isNaN() || sentAt > nowSeconds + MAX_SKEW || sentAt < nowSeconds - MAX_AGE) return null
    val url = json.opt("url")
    if (url != null && url != JSONObject.NULL && url !is String) return null
    val category = json.opt("category")
    if (category != null && category != JSONObject.NULL && category !is String) return null
    val cleanTitle = clean(title, 200)
    return Message(
      title = cleanTitle.ifEmpty { "Flowplan" },
      body = clean(body, 2000),
      path = (url as? String)?.let { path(it, origin) },
      id = id,
      category = (category as? String)?.let { CATEGORIES[it] },
      data = json.opt("data") as? JSONObject,
    )
  }

  fun clean(text: String, max: Int): String {
    val kept = text.filter { c ->
      val code = c.code
      val control = code < 0x20 || code == 0x7F || code == 0x2028 || code == 0x2029
      !control || c == '\t' || c == '\n' || c == '\r'
    }
    return kept.trim().take(max).trim()
  }

  /** A path, or an address on the instance's own origin made a path; anything else is dropped. */
  fun path(value: String, origin: String): String? {
    if (value.isEmpty() || value.length > 2000) return null
    if (value.startsWith("/")) return safePath(value)
    val uri = try {
      URI(value)
    } catch (e: URISyntaxException) {
      return null
    }
    val scheme = uri.scheme?.lowercase() ?: return null
    if (scheme != "https" && scheme != "http") return null
    if (uri.rawUserInfo != null) return null
    val host = uri.host?.lowercase() ?: return null
    val port = uri.port
    val defaultPort = port == -1 || (scheme == "https" && port == 443) || (scheme == "http" && port == 80)
    val own = if (defaultPort) "$scheme://$host" else "$scheme://$host:$port"
    if (own != origin) return null
    val path = (uri.rawPath?.takeIf { it.isNotEmpty() } ?: "/") +
      (uri.rawQuery?.let { "?$it" } ?: "") +
      (uri.rawFragment?.let { "#$it" } ?: "")
    return safePath(path)
  }

  /** navigation.ts → safePath: one leading "/", no backslash or whitespace. */
  fun safePath(path: String): String? {
    if (!path.startsWith("/") || path.startsWith("//")) return null
    if (path.any { it == '\\' || it.isWhitespace() }) return null
    return path
  }

  fun collapseTag(value: String?): String? = value?.takeIf { TAG.matches(it) }

  fun badge(value: String?): Int? = value?.takeIf { BADGE.matches(it) }?.toIntOrNull()

  /** null: nothing to show (a background message, or one already shown). */
  fun notification(context: Context, original: RemoteMessage, payload: String): RemoteMessage? {
    // Background messages (§6.4) carry nothing to show; the app refreshes itself.
    if (original.data["type"] == "background") return null
    // Never a crash for a message: what fails is the placeholder.
    val opened = try {
      PushKeys.open(context, payload)
    } catch (e: Exception) {
      null
    }
    val message = opened?.let { parse(it.plaintext, it.origin, System.currentTimeMillis() / 1000) }
    opened?.plaintext?.fill(0)
    // The relay repeating a message: not shown again.
    if (opened != null && message != null && PushKeys.shownBefore(context, opened.origin, message.id)) return null
    val data = HashMap<String, String>()
    data["channelId"] = "inbox"
    if (opened != null && message != null) {
      data["title"] = message.title
      data["message"] = message.body
      val body = message.data?.let { JSONObject(it.toString()) } ?: JSONObject()
      message.path?.let { body.put("url", it) }
      body.put("notificationId", message.id)
      body.put("origin", opened.origin)
      message.category?.let {
        body.put("category", it)
        data["categoryId"] = it
      }
      data["body"] = body.toString()
    } else {
      data["title"] = "Flowplan"
      data["message"] = context.getString(R.string.flowplan_push_placeholder)
    }
    // Outside the encryption (the relay's): only what fits.
    collapseTag(original.data["collapseId"])?.let { data["tag"] = it }
    badge(original.data["badge"])?.let { data["badge"] = it.toString() }
    return RemoteMessage.Builder("${context.packageName}@push.flowplan.org")
      .setMessageId(original.messageId ?: UUID.randomUUID().toString())
      .setData(data)
      .build()
  }
}
