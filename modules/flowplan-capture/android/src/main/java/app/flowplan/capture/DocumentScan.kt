package app.flowplan.capture

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit

/** What a scan gives the app: the PDF in the caches folder and the text recognised on its pages. */
internal class ScanResult(val file: File, val pages: Int, val text: String) {
  fun map(): Map<String, Any> =
    mapOf("uri" to Uri.fromFile(file).toString(), "name" to file.name, "pages" to pages, "text" to text, "size" to file.length().toDouble())
}

/**
 * ML Kit's document scanner and text recognition, like DocumentScanner.swift on iOS: the
 * scanner's JPEG pages are shrunk like there (at most 2200 px on the long side, JPEG 70 %), read
 * by the Latin text recognition, and written as one PDF with the text invisibly at the
 * recognised positions (ScanPdf).
 */
internal object DocumentScan {
  const val MAX_PIXELS = 2200
  const val JPEG_QUALITY = 70

  // The full scanner (filters, clean-up, cropping) like VisionKit's; no page limit, as on iOS
  // (the instance's upload limit applies to the PDF). Pages only from the camera, as on iOS.
  fun client(): GmsDocumentScanner =
    GmsDocumentScanning.getClient(
      GmsDocumentScannerOptions.Builder()
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .setGalleryImportAllowed(false)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .build(),
    )

  fun pages(data: Intent?): List<Uri> {
    if (data == null) return emptyList()
    val result = GmsDocumentScanningResult.fromActivityResultIntent(data) ?: return emptyList()
    return result.pages?.map { it.imageUri }.orEmpty()
  }

  fun makePdf(context: Context, pages: List<Uri>, title: String): ScanResult {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val file = File(folder(context), fileName(title))
    val texts = mutableListOf<String>()
    try {
      file.outputStream().buffered().use { out ->
        val pdf = ScanPdf(out, title, pages.size)
        for (uri in pages) {
          val bitmap = load(context, uri)
          val lines = recognize(recognizer, bitmap)
          val jpeg = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }.toByteArray()
          pdf.page(jpeg, bitmap.width, bitmap.height, lines)
          bitmap.recycle()
          texts.add(lines.joinToString("\n") { it.text })
        }
        pdf.finish()
      }
    } catch (error: Exception) {
      file.delete()
      throw error
    } finally {
      recognizer.close()
    }
    // The scanner's own page files are not needed any more.
    for (uri in pages) if (uri.scheme == "file") uri.path?.let { File(it).delete() }
    return ScanResult(file, pages.size, texts.filter { it.isNotEmpty() }.joinToString("\n\n"))
  }

  // A page at most MAX_PIXELS on the long side (decoded smaller first, then scaled exactly).
  private fun load(context: Context, uri: Uri): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    val longest = maxOf(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (longest / (sample * 2) >= MAX_PIXELS) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val decoded = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: throw java.io.IOException("A page of the scan could not be read.")
    val side = maxOf(decoded.width, decoded.height)
    if (side <= MAX_PIXELS) return decoded
    val factor = MAX_PIXELS.toFloat() / side
    val scaled = Bitmap.createScaledBitmap(decoded, Math.round(decoded.width * factor), Math.round(decoded.height * factor), true)
    if (scaled !== decoded) decoded.recycle()
    return scaled
  }

  // The lines ML Kit read, with their boxes in the bitmap's pixels. Without the model (Play
  // services still downloading it) or on an error the page simply has no text, as on iOS.
  private fun recognize(recognizer: com.google.mlkit.vision.text.TextRecognizer, bitmap: Bitmap): List<ScanLine> =
    try {
      val text = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 60, TimeUnit.SECONDS)
      text.textBlocks.flatMap { block ->
        block.lines.mapNotNull { line ->
          val box = line.boundingBox ?: return@mapNotNull null
          if (line.text.isBlank()) null else ScanLine(line.text, box.left.toFloat(), box.top.toFloat(), box.right.toFloat(), box.bottom.toFloat())
        }
      }
    } catch (_: Exception) {
      emptyList()
    }

  fun folder(context: Context): File = File(context.cacheDir, "FlowplanScans").apply { mkdirs() }

  // Like FPCScanPDF.fileName on iOS.
  fun fileName(title: String): String = safeName(title, "Scan").removeSuffix(".pdf") + ".pdf"

  fun safeName(name: String, fallback: String = "file"): String {
    val cleaned = name.replace(Regex("[/\\\\:?%*|\"<>\\u0000-\\u001f]"), "-").trim()
    return (cleaned.ifEmpty { fallback }).take(100)
  }
}
