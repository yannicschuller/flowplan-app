package app.flowplan.nativeshell

import android.content.Context
import android.net.Uri
import android.net.http.X509TrustManagerExtensions
import android.util.Base64
import com.facebook.react.modules.network.CustomClientBuilder
import com.facebook.react.modules.network.NetworkingModule
import java.net.InetSocketAddress
import java.net.Socket
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.Locale
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedTrustManager
import javax.net.ssl.X509TrustManager

/**
 * Certificates the person trusted for an instance (src/certs/pins.ts, yannicschuller/flowplan#271):
 * a self-hosted instance with a self-signed certificate, or one of a private CA this device does not
 * trust. The app first trusts what Android trusts – with plugins/with-network-security.js also the
 * CAs the person installed. Beyond that, exactly the certificates the person confirmed in the app
 * after seeing their SHA-256 fingerprint, and each only for the host it was confirmed for:
 *
 * - the app's own requests (React Native's fetch, OkHttp: the setup's check, the health check,
 *   push registration, widgets and background refreshes) through [PinningTrustManager];
 * - the web views through [PinnedWebViewClient].
 *
 * Never a blanket "accept every certificate": the system decides first, a pin only counts for its
 * host and its exact certificate ([matches], the rule of src/certs/pins.ts → pinAllows), and
 * nothing changes for plain HTTP. Kept in the app's preferences as well (host and fingerprint – no
 * secret), for background work that runs before the JavaScript side has handed them over.
 */
object CertificatePins {
  private const val PREFS = "flowplan.certificatePins"
  private const val KEY = "pins"
  private val FINGERPRINT = Regex("^[0-9a-f]{64}$")

  // "host sha256" entries.
  @Volatile private var pins: Set<String> = emptySet()
  @Volatile private var loaded = false

  @JvmStatic
  fun normalizeHost(host: String?): String =
    (host ?: "").trim().lowercase(Locale.ROOT).removePrefix("[").removeSuffix("]").removeSuffix(".")

  @JvmStatic
  fun sha256(der: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(der).joinToString("") { "%02x".format(it) }

  /** Whether [der] is the certificate pinned for [host] – the host it was presented for. */
  @JvmStatic
  fun matches(host: String?, der: ByteArray?): Boolean {
    val name = normalizeHost(host)
    if (name.isEmpty() || der == null || pins.isEmpty()) return false
    return pins.contains("$name ${sha256(der)}")
  }

  /** The pins from JavaScript (setCertificatePins): host and fingerprint, nothing else. */
  fun set(context: Context, list: List<Map<String, Any?>>) {
    val next = list.mapNotNull { entry ->
      val host = normalizeHost(entry["host"] as? String)
      val sha256 = (entry["sha256"] as? String)?.lowercase(Locale.ROOT) ?: ""
      if (host.isEmpty() || !FINGERPRINT.matches(sha256)) null else "$host $sha256"
    }.toSet()
    val removed = pins.any { it !in next }
    pins = next
    loaded = true
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY, next).apply()
    if (removed) onRemoved?.invoke()
  }

  // A pin went: the web views forget what they let through (FlowplanNativeModule).
  var onRemoved: (() -> Unit)? = null

  fun load(context: Context) {
    if (loaded) return
    pins = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY, emptySet())?.toSet() ?: emptySet()
    loaded = true
  }

  /**
   * React Native's requests: every OkHttp client NetworkingModule builds for a request passes here.
   * Without pins nothing changes; with pins, the trust manager and host name check below, which
   * ask the system first.
   */
  fun install(context: Context) {
    load(context)
    NetworkingModule.setCustomClientBuilder(CustomClientBuilder { builder ->
      if (pins.isEmpty()) return@CustomClientBuilder
      builder.sslSocketFactory(socketFactory, trustManager).hostnameVerifier(hostnameVerifier)
    })
  }

  /** The platform's trust manager – with the app's network security config (system and user CAs). */
  val systemTrustManager: X509TrustManager by lazy {
    val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    factory.init(null as KeyStore?)
    factory.trustManagers.filterIsInstance<X509TrustManager>().first()
  }

  val trustManager: PinningTrustManager by lazy { PinningTrustManager(systemTrustManager) }

  private val socketFactory by lazy {
    SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustManager), null) }.socketFactory
  }

  // The system's host name check first; a pinned certificate counts for its own host (a
  // self-signed certificate often names no host the system accepts).
  private val hostnameVerifier = HostnameVerifier { host, session ->
    HttpsURLConnection.getDefaultHostnameVerifier().verify(host, session) ||
      matches(host, runCatching { session.peerCertificates.firstOrNull()?.encoded }.getOrNull())
  }

  /**
   * The certificate an HTTPS instance presents, for the dialog (src/certs/review.ts): the chain as
   * base64 DER and whether the system trusts it. The handshake ends in the trust manager – before
   * anything is sent to the server. null when nothing answers with TLS.
   */
  fun inspect(origin: String): Map<String, Any>? {
    val uri = Uri.parse(origin)
    if (uri.scheme != "https") return null
    val host = normalizeHost(uri.host)
    if (host.isEmpty()) return null
    val port = if (uri.port > 0) uri.port else 443
    var chain: List<String>? = null
    var trusted = false
    val recorder = object : X509TrustManager {
      override fun checkClientTrusted(certs: Array<out X509Certificate>?, authType: String?) {
        throw CertificateException("Not a client")
      }

      override fun checkServerTrusted(certs: Array<out X509Certificate>?, authType: String?) {
        if (certs.isNullOrEmpty()) throw CertificateException("No certificate")
        chain = certs.map { Base64.encodeToString(it.encoded, Base64.NO_WRAP) }
        trusted = runCatching {
          X509TrustManagerExtensions(systemTrustManager).checkServerTrusted(arrayOf(*certs), authType, host)
        }.isSuccess
        // Never accepted here: the handshake ends, nothing reaches the server.
        throw CertificateException("Inspected")
      }

      override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }
    val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(recorder), null) }
    try {
      Socket().use { plain ->
        plain.connect(InetSocketAddress(host, port), TIMEOUT_MS)
        plain.soTimeout = TIMEOUT_MS
        (context.socketFactory.createSocket(plain, host, port, true) as SSLSocket).use { ssl ->
          runCatching { ssl.startHandshake() }
        }
      }
    } catch (_: Exception) {
      // Not reachable (or reset after the certificate): what was seen counts.
    }
    val certificates = chain ?: return null
    return mapOf("chain" to certificates, "trusted" to trusted)
  }

  private const val TIMEOUT_MS = 8000
}

/**
 * The system's trust decision first; when it refuses, the certificate the person pinned for the
 * host the connection is for – that exact certificate, that host only. Hostname-aware like the
 * platform's own (X509TrustManagerExtensions), so the network security config applies as it is.
 */
class PinningTrustManager(private val system: X509TrustManager) : X509ExtendedTrustManager() {
  private val extensions = X509TrustManagerExtensions(system)

  override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = system.checkClientTrusted(chain, authType)
  override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?, socket: Socket?) = system.checkClientTrusted(chain, authType)
  override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?, engine: SSLEngine?) = system.checkClientTrusted(chain, authType)

  override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = check(chain, authType, null)
  override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?, socket: Socket?) =
    check(chain, authType, (socket as? SSLSocket)?.handshakeSession?.peerHost)
  override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?, engine: SSLEngine?) =
    check(chain, authType, engine?.handshakeSession?.peerHost ?: engine?.peerHost)

  /** The hostname-aware variant Android's X509TrustManagerExtensions looks for (OkHttp uses it). */
  fun checkServerTrusted(chain: Array<X509Certificate>, authType: String, host: String): List<X509Certificate> {
    check(chain, authType, host)
    return chain.toList()
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = system.acceptedIssuers

  private fun check(chain: Array<out X509Certificate>?, authType: String?, host: String?) {
    if (chain.isNullOrEmpty()) throw CertificateException("No certificate")
    try {
      if (host != null) extensions.checkServerTrusted(arrayOf(*chain), authType, host)
      else system.checkServerTrusted(chain, authType)
    } catch (error: CertificateException) {
      if (CertificatePins.matches(host, chain[0].encoded)) return
      throw error
    }
  }
}
