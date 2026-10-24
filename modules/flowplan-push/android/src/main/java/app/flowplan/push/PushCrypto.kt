package app.flowplan.push

import com.google.crypto.tink.subtle.Hkdf
import com.google.crypto.tink.subtle.X25519
import java.security.GeneralSecurityException
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * The push relay's end-to-end encryption (PROTOCOL.md §4 and §6.9 of flowplan-push, src/push-relay.ts):
 * payload = base64url(0x01 ‖ ephemeral X25519 public key (32) ‖ nonce (12) ‖ ciphertext ‖ tag (16)),
 * key = HKDF-SHA256(X25519(device private, ephemeral), salt = ephemeral ‖ device public,
 * info = "flowplan-push-v1\n" + instance origin, 32 bytes), AES-256-GCM with the same info as
 * additional data – a payload for another instance never opens.
 * A payload that does not verify gives null – there is no other way in.
 */
internal object PushCrypto {
  const val PROTOCOL = "flowplan-push-v1"
  fun info(instance: String): ByteArray = "$PROTOCOL\n$instance".toByteArray(Charsets.UTF_8)
  const val VERSION: Byte = 1
  const val MAX_PAYLOAD = 2800
  const val MIN_PAYLOAD = 1 + 32 + 12 + 16
  private val BASE64URL = Regex("^[A-Za-z0-9_-]*$")

  fun encode(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

  /** Strict base64url without padding. */
  fun decode(value: String): ByteArray? {
    if (value.length % 4 == 1 || !BASE64URL.matches(value)) return null
    return try {
      Base64.getUrlDecoder().decode(value)
    } catch (e: IllegalArgumentException) {
      null
    }
  }

  fun newPrivateKey(): ByteArray = X25519.generatePrivateKey()

  fun publicKey(privateKey: ByteArray): ByteArray = X25519.publicFromPrivate(privateKey)

  fun open(payload: String, privateKey: ByteArray, instance: String): ByteArray? {
    if (payload.length > (MAX_PAYLOAD * 4 + 2) / 3) return null
    val bytes = decode(payload) ?: return null
    if (bytes.size < MIN_PAYLOAD || bytes.size > MAX_PAYLOAD || bytes[0] != VERSION) return null
    val ephemeral = bytes.copyOfRange(1, 33)
    val nonce = bytes.copyOfRange(33, 45)
    val sealed = bytes.copyOfRange(45, bytes.size)
    val bound = info(instance)
    var shared: ByteArray? = null
    var key: ByteArray? = null
    return try {
      // Tink refuses low-order public keys; the all-zero check stays as a second line.
      val secret = X25519.computeSharedSecret(privateKey, ephemeral)
      shared = secret
      if (secret.all { it == 0.toByte() }) return null
      val derived = Hkdf.computeHkdf("HMACSHA256", secret, ephemeral + publicKey(privateKey), bound, 32)
      key = derived
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(derived, "AES"), GCMParameterSpec(128, nonce))
      cipher.updateAAD(bound)
      cipher.doFinal(sealed)
    } catch (e: GeneralSecurityException) {
      null
    } catch (e: IllegalArgumentException) {
      null
    } catch (e: IllegalStateException) {
      null
    } finally {
      shared?.fill(0)
      key?.fill(0)
    }
  }
}
