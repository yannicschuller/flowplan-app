package app.flowplan.capture

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The document scanner of the Flowplan app on Android (#397), the counterpart of
 * ios/FlowplanCaptureModule.swift with the same answers for src/screens/Scan.tsx:
 *
 * - ML Kit's document scanner (Google Play services: edges, perspective, several pages) and ML
 *   Kit's text recognition on each page; the pages become one PDF whose text lies invisibly over
 *   the images (DocumentScan.kt, ScanPdf.kt), the text goes to the instance as its search text;
 * - without Google Play services the scan is not possible: the app says so and offers to add a
 *   PDF or photo instead (pickDocument, Android's own file picker – no permission needed).
 *
 * Spotlight is iOS only; src/index.ts asks for it only there.
 */
class FlowplanCaptureModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No context")

  // The scan or file pick while its screen is open.
  private var pendingScan: Promise? = null
  private var pendingTitle = ""
  private var pendingPick: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("FlowplanCapture")

    // Google Play services are there and usable; the scanner module itself is downloaded by them
    // when it is first opened (a failure then rejects with ERR_SCANNER_UNAVAILABLE).
    Function("isScannerAvailable") {
      playServicesReady(context)
    }

    // The document scanner; null when cancelled. languages: ignored here – ML Kit's Latin model
    // reads German, English and French alike.
    AsyncFunction("scanDocument") { title: String, _: List<String>, promise: Promise ->
      if (!playServicesReady(context)) {
        return@AsyncFunction promise.reject("ERR_SCANNER_UNAVAILABLE", "Google Play services are not available on this device.", null)
      }
      if (pendingScan != null) return@AsyncFunction promise.reject("ERR_SCANNER_BUSY", "A scan is already running.", null)
      val activity = appContext.currentActivity ?: return@AsyncFunction promise.reject("ERR_SCANNER_NO_VIEW", "No view to show the scanner on.", null)
      pendingScan = promise
      pendingTitle = title
      DocumentScan.client()
        .getStartScanIntent(activity)
        .addOnSuccessListener { sender ->
          try {
            activity.startIntentSenderForResult(sender, REQUEST_SCAN, null, 0, 0, 0)
          } catch (error: Exception) {
            failScan("ERR_SCAN_FAILED", error)
          }
        }
        .addOnFailureListener { error ->
          // The scanner module could not be loaded (not downloadable, device not supported).
          failScan("ERR_SCANNER_UNAVAILABLE", error)
        }
    }.runOnQueue(Queues.MAIN)

    // Android's file picker for a PDF or a photo, copied to the caches: { uri, name, type, size },
    // or null when cancelled.
    AsyncFunction("pickDocument") { promise: Promise ->
      val activity = appContext.currentActivity ?: return@AsyncFunction promise.reject("ERR_PICKER_NO_VIEW", "No view to show the picker on.", null)
      pendingPick?.resolve(null)
      pendingPick = promise
      try {
        activity.startActivityForResult(FilePick.intent(), REQUEST_PICK)
      } catch (error: Exception) {
        pendingPick = null
        promise.reject("ERR_PICKER", error.message ?: "No file picker", error)
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      when (payload.requestCode) {
        REQUEST_SCAN -> {
          val promise = pendingScan ?: return@OnActivityResult
          pendingScan = null
          val pages: List<Uri> = if (payload.resultCode == Activity.RESULT_OK) DocumentScan.pages(payload.data) else emptyList()
          if (pages.isEmpty()) return@OnActivityResult promise.resolve(null)
          val title = pendingTitle
          // Recognising and writing happen off the main thread.
          Thread {
            try {
              promise.resolve(DocumentScan.makePdf(context, pages, title).map())
            } catch (error: Exception) {
              promise.reject("ERR_SCAN_FAILED", error.message ?: "The scan could not be saved.", error)
            }
          }.start()
        }
        REQUEST_PICK -> {
          val promise = pendingPick ?: return@OnActivityResult
          pendingPick = null
          val uri: Uri? = if (payload.resultCode == Activity.RESULT_OK) payload.data?.data else null
          if (uri == null) return@OnActivityResult promise.resolve(null)
          Thread {
            try {
              promise.resolve(FilePick.copy(context, uri))
            } catch (error: Exception) {
              promise.reject("ERR_PICKER", error.message ?: "The file could not be read.", error)
            }
          }.start()
        }
      }
    }
  }

  private fun failScan(code: String, error: Exception) {
    val promise = pendingScan ?: return
    pendingScan = null
    promise.reject(code, error.message ?: "The document scanner is not available.", error)
  }

  companion object {
    // Distinct from modules/flowplan-native's (AppUpdates.kt: 0x7310, 0x7311).
    const val REQUEST_SCAN = 0x7320
    const val REQUEST_PICK = 0x7321

    fun playServicesReady(context: Context): Boolean =
      try {
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
      } catch (_: Exception) {
        false
      }
  }
}

/** Android's file picker for what the instance takes from the app: PDFs and photos. */
internal object FilePick {
  fun intent(): Intent =
    Intent(Intent.ACTION_OPEN_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("*/*")
      .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/pdf", "image/*"))

  fun copy(context: Context, uri: Uri): Map<String, Any> {
    val resolver = context.contentResolver
    var name = "file"
    resolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0)
    }
    val type = resolver.getType(uri) ?: "application/octet-stream"
    val file = java.io.File(DocumentScan.folder(context), DocumentScan.safeName(name))
    val input = resolver.openInputStream(uri) ?: throw java.io.IOException("The file could not be opened.")
    input.use { source -> file.outputStream().use { source.copyTo(it) } }
    return mapOf("uri" to Uri.fromFile(file).toString(), "name" to file.name, "type" to type, "size" to file.length().toDouble())
  }
}
