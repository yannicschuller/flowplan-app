package app.flowplan.push

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import org.json.JSONException
import org.json.JSONObject
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * One X25519 key pair per profile (instance) of this installation. The private key is kept
 * encrypted (AES-256-GCM) with a key of the Android Keystore that never leaves it, bound to its
 * profile and address (additional data); the app's private preferences hold only that ciphertext
 * (the app allows no backup). Nothing here logs a key, a token or a payload.
 */
internal object PushKeys {
  private const val PREFS = "flowplan.push.keys"
  private const val PREFIX = "key."
  private const val ALIAS = "flowplan.push.wrap"
  const val MAX_KEYS = 10
  private const val SEEN = "seen"
  private const val SEEN_IDS = 200
  private val PROFILE = Regex("^[a-z0-9]{1,32}$")
  private val ORIGIN = Regex("^https?://[^/?#@\\s]{1,255}$")

  class Entry(val profile: String, val origin: String, val privateKey: ByteArray, val updated: Long)

  class Opened(val profile: String, val origin: String, val plaintext: ByteArray)

  private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun aad(profile: String, origin: String) = "flowplan-push-key|$profile|$origin".toByteArray(Charsets.UTF_8)

  private fun wrapKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return generator.generateKey()
  }

  /** The profile's public key (base64url); a new pair when there is none or it was made for another address. */
  @Synchronized
  fun publicKey(context: Context, profile: String, origin: String): String? {
    if (!PROFILE.matches(profile) || !ORIGIN.matches(origin)) return null
    val existing = load(context, profile)
    if (existing != null && existing.origin == origin) {
      try {
        return PushCrypto.encode(PushCrypto.publicKey(existing.privateKey))
      } finally {
        existing.privateKey.fill(0)
      }
    }
    existing?.privateKey?.fill(0)
    val privateKey = PushCrypto.newPrivateKey()
    try {
      if (!save(context, profile, origin, privateKey)) return null
      return PushCrypto.encode(PushCrypto.publicKey(privateKey))
    } catch (e: GeneralSecurityException) {
      return null
    } finally {
      privateKey.fill(0)
    }
  }

  private fun save(context: Context, profile: String, origin: String, privateKey: ByteArray): Boolean {
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, wrapKey())
      cipher.updateAAD(aad(profile, origin))
      val sealed = cipher.doFinal(privateKey)
      val item = JSONObject()
        .put("origin", origin)
        .put("iv", PushCrypto.encode(cipher.iv))
        .put("key", PushCrypto.encode(sealed))
        .put("updated", System.currentTimeMillis())
      prefs(context).edit().putString(PREFIX + profile, item.toString()).commit()
    } catch (e: Exception) {
      // GeneralSecurityException, or the Keystore's ProviderException.
      Log.e("FlowplanPush", "Push key not saved: ${e.javaClass.simpleName}")
      false
    }
  }

  private fun load(context: Context, profile: String): Entry? {
    val raw = prefs(context).getString(PREFIX + profile, null) ?: return null
    return try {
      val item = JSONObject(raw)
      val origin = item.getString("origin")
      val iv = PushCrypto.decode(item.getString("iv")) ?: return null
      val sealed = PushCrypto.decode(item.getString("key")) ?: return null
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, wrapKey(), GCMParameterSpec(128, iv))
      cipher.updateAAD(aad(profile, origin))
      val privateKey = cipher.doFinal(sealed)
      if (privateKey.size != 32) return null
      Entry(profile, origin, privateKey, item.optLong("updated", 0L))
    } catch (e: JSONException) {
      null
    } catch (e: Exception) {
      // The Keystore key is gone or refused (e.g. a restored device): the profile registers anew.
      Log.e("FlowplanPush", "Push key not readable: ${e.javaClass.simpleName}")
      null
    }
  }

  /** Notification ids already shown (PROTOCOL.md §6.9, the last 200): true when shown before. */
  @Synchronized
  fun shownBefore(context: Context, origin: String, id: String): Boolean {
    val prefs = prefs(context)
    val entry = "$origin|$id"
    val seen = (prefs.getString(SEEN, null) ?: "").split('\n').filter { it.isNotEmpty() }.toMutableList()
    if (entry in seen) return true
    seen.add(entry)
    while (seen.size > SEEN_IDS) seen.removeAt(0)
    prefs.edit().putString(SEEN, seen.joinToString("\n")).apply()
    return false
  }

  @Synchronized
  fun delete(context: Context, profile: String): Boolean {
    if (!PROFILE.matches(profile)) return false
    return prefs(context).edit().remove(PREFIX + profile).commit()
  }

  @Synchronized
  fun keepOnly(context: Context, profiles: Set<String>) {
    val prefs = prefs(context)
    val editor = prefs.edit()
    for (name in prefs.all.keys) {
      if (name.startsWith(PREFIX) && name.removePrefix(PREFIX) !in profiles) editor.remove(name)
    }
    editor.commit()
  }

  /** Tries the stored keys (most recently written first, at most MAX_KEYS); the first that verifies. */
  @Synchronized
  fun open(context: Context, payload: String): Opened? {
    val updated = { raw: Any? ->
      try {
        JSONObject(raw as? String ?: "{}").optLong("updated", 0L)
      } catch (e: JSONException) {
        0L
      }
    }
    val profiles = prefs(context).all.entries
      .filter { it.key.startsWith(PREFIX) && PROFILE.matches(it.key.removePrefix(PREFIX)) }
      .sortedByDescending { updated(it.value) }
      .take(MAX_KEYS)
      .map { it.key.removePrefix(PREFIX) }
    val entries = profiles.mapNotNull { load(context, it) }
    try {
      for (entry in entries) {
        val plaintext = PushCrypto.open(payload, entry.privateKey, entry.origin) ?: continue
        return Opened(entry.profile, entry.origin, plaintext)
      }
      return null
    } finally {
      for (entry in entries) entry.privateKey.fill(0)
    }
  }
}
