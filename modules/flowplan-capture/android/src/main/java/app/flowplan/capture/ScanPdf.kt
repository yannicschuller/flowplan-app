package app.flowplan.capture

import android.graphics.Paint
import android.graphics.Typeface
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.Locale
import java.util.zip.Deflater
import java.util.zip.DeflaterOutputStream

/** A line ML Kit read, its box in the page image's pixels (origin top left). */
internal class ScanLine(val text: String, val left: Float, val top: Float, val right: Float, val bottom: Float)

/**
 * A small PDF writer for scans: each page is its JPEG as it is (DCTDecode, not encoded again) and
 * the recognised lines on top in text rendering mode 3 ("invisible", as OCR software and
 * DocumentScanner.swift do) – PDF viewers select and search the text, the instance's text
 * extraction reads it. android.graphics.pdf.PdfDocument cannot write invisible text, hence this.
 *
 * The text uses the standard font Helvetica with WinAnsiEncoding (nothing embedded): ML Kit's
 * Latin model reads exactly that range; other characters become "?". Each line is stretched to
 * its box's width (Tz), measured with the system's sans-serif font, close to Helvetica's widths.
 *
 * Objects: 1 catalog, 2 page tree, 3 font, 4 info, then per page its page, content and image.
 */
internal class ScanPdf(output: OutputStream, title: String, private val pageCount: Int) {
  private val out = Counting(output)
  private val offsets = HashMap<Int, Long>()
  private var index = 0
  private val paint = Paint().apply {
    typeface = Typeface.SANS_SERIF
    textSize = MEASURE
  }

  init {
    out.write("%PDF-1.4\n%âãÏÓ\n".toByteArray(Charsets.ISO_8859_1))
    val kids = (0 until pageCount).joinToString(" ") { "${pageObject(it)} 0 R" }
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    obj(2, "<< /Type /Pages /Kids [$kids] /Count $pageCount >>")
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    obj(4, "<< /Creator ${textString("Flowplan")} /Producer ${textString("Flowplan")} /Title ${textString(title)} >>")
  }

  /** One page: the image (width × height pixels) at A4's long side, the lines over it. */
  fun page(jpeg: ByteArray, width: Int, height: Int, lines: List<ScanLine>) {
    check(index < pageCount) { "More pages than announced" }
    val (pageWidth, pageHeight) = pageSize(width, height)
    val page = pageObject(index)
    val content = StringBuilder()
    content.append("q ${num(pageWidth)} 0 0 ${num(pageHeight)} 0 0 cm /Im0 Do Q\n")
    val sx = pageWidth / width
    val sy = pageHeight / height
    var opened = false
    for (line in lines) {
      val boxWidth = (line.right - line.left) * sx
      val boxHeight = (line.bottom - line.top) * sy
      if (boxWidth <= 1 || boxHeight <= 1) continue
      val bytes = winAnsi(line.text)
      if (bytes.isEmpty()) continue
      val fontSize = boxHeight * 0.8f
      val natural = paint.measureText(line.text) / MEASURE * fontSize
      if (natural <= 0) continue
      val scale = (100f * boxWidth / natural).coerceIn(1f, 1000f)
      // PDF's origin is bottom left; the baseline a fifth above the box's bottom (as on iOS).
      val x = line.left * sx
      val y = pageHeight - line.bottom * sy + boxHeight * 0.2f
      if (!opened) {
        content.append("BT 3 Tr\n")
        opened = true
      }
      content.append("/F1 ${num(fontSize)} Tf ${num(scale)} Tz 1 0 0 1 ${num(x)} ${num(y)} Tm (")
      content.append(literal(bytes))
      content.append(") Tj\n")
    }
    if (opened) content.append("ET\n")
    obj(
      page,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] " +
        "/Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>",
    )
    val stream = deflate(content.toString().toByteArray(Charsets.ISO_8859_1))
    obj(page + 1, "<< /Length ${stream.size} /Filter /FlateDecode >>", stream)
    obj(page + 2, "<< /Type /XObject /Subtype /Image /Width $width /Height $height /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.size} >>", jpeg)
    index++
  }

  fun finish() {
    check(index == pageCount) { "Fewer pages than announced" }
    val size = pageObject(pageCount)
    val xref = out.count
    val table = StringBuilder("xref\n0 $size\n0000000000 65535 f \n")
    for (number in 1 until size) table.append(String.format(Locale.ROOT, "%010d 00000 n \n", offsets[number] ?: 0L))
    table.append("trailer\n<< /Size $size /Root 1 0 R /Info 4 0 R >>\nstartxref\n$xref\n%%EOF\n")
    out.write(table.toString().toByteArray(Charsets.ISO_8859_1))
    out.flush()
  }

  private fun obj(number: Int, dictionary: String, stream: ByteArray? = null) {
    offsets[number] = out.count
    out.write("$number 0 obj\n$dictionary".toByteArray(Charsets.ISO_8859_1))
    if (stream != null) {
      out.write("\nstream\n".toByteArray(Charsets.ISO_8859_1))
      out.write(stream)
      out.write("\nendstream".toByteArray(Charsets.ISO_8859_1))
    }
    out.write("\nendobj\n".toByteArray(Charsets.ISO_8859_1))
  }

  private class Counting(private val target: OutputStream) : OutputStream() {
    var count = 0L
      private set

    override fun write(b: Int) {
      target.write(b)
      count++
    }

    override fun write(b: ByteArray, off: Int, len: Int) {
      target.write(b, off, len)
      count += len
    }

    override fun flush() = target.flush()
  }

  companion object {
    // The long side of a page in points (A4 at 72 dpi), as on iOS.
    const val PAGE_POINTS = 842f
    private const val MEASURE = 100f

    fun pageObject(index: Int) = 5 + index * 3

    fun pageSize(width: Int, height: Int): Pair<Float, Float> {
      val longest = maxOf(width, height)
      if (longest <= 0) return 595f to 842f
      val scale = PAGE_POINTS / longest
      return Math.round(width * scale).toFloat() to Math.round(height * scale).toFloat()
    }

    fun num(value: Float): String = String.format(Locale.ROOT, "%.2f", value).trimEnd('0').trimEnd('.')

    fun deflate(bytes: ByteArray): ByteArray {
      val buffer = ByteArrayOutputStream()
      DeflaterOutputStream(buffer, Deflater(Deflater.BEST_COMPRESSION)).use { it.write(bytes) }
      return buffer.toByteArray()
    }

    // A text string of the info dictionary: UTF-16BE with its byte order mark, as hex.
    fun textString(text: String): String {
      val hex = StringBuilder("<FEFF")
      for (unit in text) hex.append(String.format(Locale.ROOT, "%04X", unit.code))
      return hex.append(">").toString()
    }

    // A literal string's content: printable ASCII as it is, the rest as octal escapes.
    fun literal(bytes: ByteArray): String {
      val text = StringBuilder()
      for (byte in bytes) {
        val code = byte.toInt() and 0xff
        when {
          code == '('.code || code == ')'.code || code == '\\'.code -> text.append('\\').append(code.toChar())
          code in 32..126 -> text.append(code.toChar())
          else -> text.append('\\').append(String.format(Locale.ROOT, "%03o", code))
        }
      }
      return text.toString()
    }

    // WinAnsiEncoding: Latin-1 plus the typographic characters at 0x80–0x9F.
    private val WIN_ANSI = mapOf(
      '€' to 0x80, '‚' to 0x82, 'ƒ' to 0x83, '„' to 0x84, '…' to 0x85, '†' to 0x86,
      '‡' to 0x87, 'ˆ' to 0x88, '‰' to 0x89, 'Š' to 0x8a, '‹' to 0x8b, 'Œ' to 0x8c,
      'Ž' to 0x8e, '‘' to 0x91, '’' to 0x92, '“' to 0x93, '”' to 0x94, '•' to 0x95,
      '–' to 0x96, '—' to 0x97, '˜' to 0x98, '™' to 0x99, 'š' to 0x9a, '›' to 0x9b,
      'œ' to 0x9c, 'ž' to 0x9e, 'Ÿ' to 0x9f,
    )

    fun winAnsi(text: String): ByteArray {
      val bytes = ByteArrayOutputStream()
      for (char in text) {
        val code = char.code
        bytes.write(
          when {
            code in 0x20..0x7e || code in 0xa0..0xff -> code
            WIN_ANSI.containsKey(char) -> WIN_ANSI.getValue(char)
            code < 0x20 -> 0x20
            else -> '?'.code
          },
        )
      }
      return bytes.toByteArray()
    }
  }
}
