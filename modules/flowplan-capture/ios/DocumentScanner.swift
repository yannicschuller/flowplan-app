import CoreText
import UIKit
import Vision
import VisionKit

/// What a scan gives the app: the PDF in the caches folder and the text
/// recognised on its pages.
struct FPCScanResult {
  let url: URL
  let pages: Int
  let text: String
  let bytes: Int

  var dictionary: [String: Any] {
    ["uri": url.absoluteString, "name": url.lastPathComponent, "pages": pages, "text": text, "size": bytes]
  }
}

enum FPCScanError: LocalizedError {
  case noPages

  var errorDescription: String? { "The scan has no pages." }
}

/// The camera's document scanner (edges found, perspective corrected,
/// several pages); the pages become one PDF with the recognised text.
final class DocumentScanner: NSObject, VNDocumentCameraViewControllerDelegate {
  private let title: String
  private let languages: [String]
  private var completion: ((Result<FPCScanResult?, Error>) -> Void)?

  init(title: String, languages: [String]) {
    self.title = title
    self.languages = languages
  }

  func present(from presenter: UIViewController, completion: @escaping (Result<FPCScanResult?, Error>) -> Void) {
    self.completion = completion
    let camera = VNDocumentCameraViewController()
    camera.delegate = self
    camera.modalPresentationStyle = .fullScreen
    presenter.present(camera, animated: true)
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) {
      self.finish(.success(nil))
    }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    controller.dismiss(animated: true) {
      self.finish(.failure(error))
    }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    // The pages are taken before the camera goes; recognising and writing
    // happen off the main thread.
    var images: [UIImage] = []
    for index in 0..<scan.pageCount {
      images.append(scan.imageOfPage(at: index))
    }
    controller.dismiss(animated: true)
    let title = self.title
    let languages = self.languages
    DispatchQueue.global(qos: .userInitiated).async {
      let result: Result<FPCScanResult?, Error>
      do {
        let made: FPCScanResult = try FPCScanPDF.make(images: images, title: title, languages: languages)
        result = .success(made)
      } catch {
        result = .failure(error)
      }
      DispatchQueue.main.async {
        self.finish(result)
      }
    }
  }

  private func finish(_ result: Result<FPCScanResult?, Error>) {
    let done = completion
    completion = nil
    done?(result)
  }
}

/// One line Vision read, with its box (normalised, origin bottom left).
struct FPCLine {
  let text: String
  let box: CGRect
}

enum FPCScanPDF {
  // Page images: at most this many pixels on the long side, as JPEG – a
  // page of a few hundred KB that stays sharp enough to read and print.
  static let maxPixels: CGFloat = 2200
  static let jpegQuality: CGFloat = 0.7
  // The long side of a page in points (A4 at 72 dpi).
  static let pagePoints: CGFloat = 842

  static func make(images: [UIImage], title: String, languages: [String]) throws -> FPCScanResult {
    guard let first = images.first else { throw FPCScanError.noPages }
    var texts: [String] = []
    let format = UIGraphicsPDFRendererFormat()
    format.documentInfo = [
      kCGPDFContextCreator as String: "Flowplan",
      kCGPDFContextTitle as String: title,
    ]
    let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: pageSize(first.size)), format: format)
    let data: Data = renderer.pdfData { context in
      for image in images {
        let page: UIImage = compressed(image)
        let bounds = CGRect(origin: .zero, size: pageSize(page.size))
        context.beginPage(withBounds: bounds, pageInfo: [:])
        page.draw(in: bounds)
        let lines: [FPCLine] = recognize(page, languages: languages)
        drawInvisible(lines, in: bounds, context: context.cgContext)
        let pageText: String = lines.map { $0.text }.joined(separator: "\n")
        texts.append(pageText)
      }
    }
    let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("FlowplanScans", isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let url = folder.appendingPathComponent(fileName(title))
    try data.write(to: url, options: .atomic)
    let text: String = texts.filter { !$0.isEmpty }.joined(separator: "\n\n")
    return FPCScanResult(url: url, pages: images.count, text: text, bytes: data.count)
  }

  static func fileName(_ title: String) -> String {
    let forbidden = CharacterSet(charactersIn: "/\\:?%*|\"<>")
    let parts: [String] = title.components(separatedBy: forbidden)
    var name: String = parts.joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
    if name.isEmpty { name = "Scan" }
    return String(name.prefix(100)) + ".pdf"
  }

  static func pageSize(_ pixels: CGSize) -> CGSize {
    let longest: CGFloat = max(pixels.width, pixels.height)
    guard longest > 0 else { return CGSize(width: 595, height: 842) }
    let scale: CGFloat = pagePoints / longest
    return CGSize(width: (pixels.width * scale).rounded(), height: (pixels.height * scale).rounded())
  }

  static func compressed(_ image: UIImage) -> UIImage {
    let size: CGSize = image.size
    let longest: CGFloat = max(size.width * image.scale, size.height * image.scale)
    let factor: CGFloat = longest > maxPixels ? maxPixels / longest : 1
    let target = CGSize(width: (size.width * image.scale * factor).rounded(), height: (size.height * image.scale * factor).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let resized: UIImage = UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
    guard let jpeg = resized.jpegData(compressionQuality: jpegQuality), let decoded = UIImage(data: jpeg) else { return resized }
    return decoded
  }

  static func recognize(_ image: UIImage, languages: [String]) -> [FPCLine] {
    guard let cgImage = image.cgImage else { return [] }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let supported: [String] = (try? request.supportedRecognitionLanguages()) ?? []
    let chosen: [String] = languages.filter { supported.contains($0) }
    if !chosen.isEmpty {
      request.recognitionLanguages = chosen
    }
    request.automaticallyDetectsLanguage = true
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    do {
      try handler.perform([request])
    } catch {
      return []
    }
    let observations: [VNRecognizedTextObservation] = request.results ?? []
    var lines: [FPCLine] = []
    for observation in observations {
      guard let candidate = observation.topCandidates(1).first else { continue }
      lines.append(FPCLine(text: candidate.string, box: observation.boundingBox))
    }
    return lines
  }

  /// The recognised lines as invisible text over the image (text drawing
  /// mode "invisible", like OCR software): PDF viewers can select and
  /// search it, and the instance's text extraction reads it.
  static func drawInvisible(_ lines: [FPCLine], in bounds: CGRect, context: CGContext) {
    for line in lines {
      let width: CGFloat = line.box.width * bounds.width
      let height: CGFloat = line.box.height * bounds.height
      guard width > 1, height > 1, !line.text.isEmpty else { continue }
      let x: CGFloat = line.box.minX * bounds.width
      // Vision's origin is bottom left, the renderer's top left.
      let bottom: CGFloat = (1 - line.box.minY) * bounds.height
      let font = UIFont.systemFont(ofSize: height * 0.8)
      let attributes: [NSAttributedString.Key: Any] = [.font: font]
      let string = NSAttributedString(string: line.text, attributes: attributes)
      let ctLine: CTLine = CTLineCreateWithAttributedString(string)
      let natural = CGFloat(CTLineGetTypographicBounds(ctLine, nil, nil, nil))
      guard natural > 0 else { continue }
      context.saveGState()
      context.setTextDrawingMode(.invisible)
      context.textMatrix = .identity
      context.translateBy(x: x, y: bottom - height * 0.2)
      // Core Text draws upwards; the line is stretched to the box's width.
      context.scaleBy(x: width / natural, y: -1)
      context.textPosition = .zero
      CTLineDraw(ctLine, context)
      context.restoreGState()
    }
  }
}
