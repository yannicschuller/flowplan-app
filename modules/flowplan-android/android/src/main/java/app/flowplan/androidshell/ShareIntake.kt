package app.flowplan.androidshell

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import java.io.File

/** A file shared from another app, copied into the app's cache (file:// URI). */
data class SharedFile(val uri: String, val name: String, val type: String, val size: Long)

/** What arrived with "Share" (SEND / SEND_MULTIPLE): text, a link, photos and PDFs. */
data class SharedContent(val subject: String, val text: String, val files: List<SharedFile>, val skipped: List<String>) {
  fun toMap(): Map<String, Any> = mapOf(
    "subject" to subject,
    "text" to text,
    "files" to files.map { mapOf("uri" to it.uri, "name" to it.name, "type" to it.type, "size" to it.size.toDouble()) },
    "skipped" to skipped,
  )
}

/**
 * Reads a share intent. Only content:// streams of other apps are taken (never the app's own
 * files or file:// paths another app points at), only photos and PDFs, at most [MAX_FILES] of
 * [MAX_BYTES] each; the rest is named in `skipped`. The streams are copied while the share's
 * read permission lasts, so the upload can happen later; the previous share's copies go.
 */
object ShareIntake {
  const val MAX_FILES = 10
  const val MAX_BYTES = 100L * 1024 * 1024
  private const val DIR = "shared"

  fun isShare(intent: Intent?): Boolean =
    intent?.action == Intent.ACTION_SEND || intent?.action == Intent.ACTION_SEND_MULTIPLE

  fun accepts(type: String?): Boolean {
    val t = type?.lowercase() ?: return false
    return (t.startsWith("image/") && !t.contains("svg")) || t == "application/pdf"
  }

  fun read(context: Context, intent: Intent): SharedContent? {
    if (!isShare(intent)) return null
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty().take(300)
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty().take(20_000)
    val dir = File(context.cacheDir, DIR)
    dir.deleteRecursively()
    dir.mkdirs()
    val files = mutableListOf<SharedFile>()
    val skipped = mutableListOf<String>()
    for ((index, uri) in streams(intent).withIndex()) {
      val name = displayName(context.contentResolver, uri) ?: "shared-${index + 1}"
      if (files.size >= MAX_FILES) {
        skipped.add(name)
        continue
      }
      val file = copy(context, uri, intent.type, dir, name, index)
      if (file == null) skipped.add(name) else files.add(file)
    }
    if (subject.isBlank() && text.isBlank() && files.isEmpty() && skipped.isEmpty()) return null
    return SharedContent(subject, text, files, skipped)
  }

  /** The copies of the last share, once it is saved or dropped. */
  fun clear(context: Context) {
    File(context.cacheDir, DIR).deleteRecursively()
  }

  private fun streams(intent: Intent): List<Uri> {
    val out = mutableListOf<Uri>()
    if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
      val list: List<Uri>? = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
      }
      list?.let { out.addAll(it) }
    } else {
      val uri: Uri? = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(Intent.EXTRA_STREAM)
      }
      uri?.let { out.add(it) }
    }
    // Some apps put the stream into the clip data only.
    if (out.isEmpty()) intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { out.add(it) } }
    return out.distinct()
  }

  private fun displayName(resolver: ContentResolver, uri: Uri): String? = try {
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) cursor.getString(0)?.let(::safeName) else null
    }
  } catch (_: Exception) {
    null
  }

  /** A file name without paths or control characters. */
  fun safeName(name: String): String? =
    name.replace(Regex("[\\u0000-\\u001f\\u007f/\\\\:*?\"<>|]"), "_").trim().trimStart('.').take(120).ifBlank { null }

  private fun copy(context: Context, uri: Uri, intentType: String?, dir: File, name: String, index: Int): SharedFile? {
    // Another app's content only: the app's own providers (and file:// paths) could point at
    // its private files and send them to the instance.
    if (uri.scheme != ContentResolver.SCHEME_CONTENT) return null
    val authority = uri.authority ?: return null
    if (authority == context.packageName || authority.startsWith("${context.packageName}.")) return null
    val resolver = context.contentResolver
    val type = (try { resolver.getType(uri) } catch (_: Exception) { null }) ?: intentType?.takeIf { !it.endsWith("/*") }
    if (!accepts(type)) return null
    val target = File(dir, "$index-$name")
    return try {
      var size = 0L
      val input = resolver.openInputStream(uri) ?: return null
      input.use { source ->
        target.outputStream().use { sink ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = source.read(buffer)
            if (read < 0) break
            size += read
            if (size > MAX_BYTES) throw IllegalStateException("too large")
            sink.write(buffer, 0, read)
          }
        }
      }
      if (size == 0L) {
        target.delete()
        null
      } else SharedFile(Uri.fromFile(target).toString(), name, type!!.lowercase(), size)
    } catch (_: Exception) {
      target.delete()
      null
    }
  }
}
