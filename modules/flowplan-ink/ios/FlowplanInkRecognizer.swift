import CoreGraphics
import Foundation
import Vision

/// The page's request (src/ink-bridge.ts checked it already; checked again
/// here): points of the ink canvas, origin top left.
struct FPInkRequest {
  static let maxStrokes = 5000
  static let maxPoints = 200_000
  static let maxSize: CGFloat = 20_000

  let id: String
  let width: CGFloat
  let height: CGFloat
  let strokes: [[CGPoint]]

  /// { id, width, height, strokes: [[x0, y0, x1, y1, …]] } (ink.ts inkPayload).
  static func parse(_ json: String) -> FPInkRequest? {
    guard let data = json.data(using: .utf8),
          let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let id = object["id"] as? String,
          !id.isEmpty, id.count <= 100,
          let width = number(object["width"]),
          let height = number(object["height"]),
          let list = object["strokes"] as? [Any] else { return nil }
    var strokes: [[CGPoint]] = []
    var count = 0
    for entry in list {
      if strokes.count >= maxStrokes || count >= maxPoints { break }
      guard let flat = entry as? [Any] else { continue }
      var points: [CGPoint] = []
      var index = 0
      while index + 1 < flat.count && count < maxPoints {
        if let x = number(flat[index]), let y = number(flat[index + 1]) {
          points.append(CGPoint(x: x, y: y))
          count += 1
        }
        index += 2
      }
      if !points.isEmpty { strokes.append(points) }
    }
    return FPInkRequest(id: id, width: clamp(width), height: clamp(height), strokes: strokes)
  }

  private static func number(_ value: Any?) -> CGFloat? {
    guard let number = value as? NSNumber else { return nil }
    let double: Double = number.doubleValue
    return double.isFinite ? CGFloat(double) : nil
  }

  private static func clamp(_ value: CGFloat) -> CGFloat {
    min(max(value, 1), maxSize)
  }
}

/// One line Vision read, its box in the request's points (top left).
struct FPInkLine {
  let text: String
  let box: CGRect

  var dictionary: [String: Any] {
    ["text": text, "box": [Double(box.minX), Double(box.minY), Double(box.width), Double(box.height)]]
  }
}

enum FPInkOutcome {
  case done([FPInkLine])
  case cancelled
  case failed(String)
}

/// One recognition; a newer one for the same id cancels it (also the Vision
/// request that runs at that moment).
final class FPInkJob {
  let request: FPInkRequest
  private let lock = NSLock()
  private var cancelled = false
  private var vision: VNRequest?

  init(request: FPInkRequest) {
    self.request = request
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let running: VNRequest? = vision
    lock.unlock()
    running?.cancel()
  }

  /// The Vision request that runs now (nil: none); false when the job is
  /// cancelled already.
  func attach(_ request: VNRequest?) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    vision = request
    return !cancelled
  }
}

/// Runs the recognitions one after the other, off the main thread (each
/// image is up to 4096 × 4096 pixels).
final class FPInkRecognizer {
  static let shared = FPInkRecognizer()
  /// Vision reads text on this device: it knows at least one language.
  static let isAvailable: Bool = !FPInkRecognizer.supportedLanguages().isEmpty

  private let queue = DispatchQueue(label: "app.flowplan.ink", qos: .userInitiated)
  private let lock = NSLock()
  private var latest: [String: FPInkJob] = [:]

  func recognize(_ request: FPInkRequest, completion: @escaping (FPInkOutcome) -> Void) {
    let job = FPInkJob(request: request)
    lock.lock()
    let previous: FPInkJob? = latest[request.id]
    latest[request.id] = job
    lock.unlock()
    previous?.cancel()
    queue.async {
      let outcome: FPInkOutcome = job.isCancelled ? .cancelled : FPInkReader.read(job)
      self.lock.lock()
      if self.latest[request.id] === job {
        self.latest[request.id] = nil
      }
      self.lock.unlock()
      completion(outcome)
    }
  }

  static func supportedLanguages() -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    return (try? request.supportedRecognitionLanguages()) ?? []
  }
}

/// Strokes → image → Vision → lines in points.
enum FPInkReader {
  /// The long side of an image Vision gets, in pixels.
  static let maxPixels: CGFloat = 4096
  /// Pixels per point: thin strokes stay legible.
  static let preferredScale: CGFloat = 2
  /// Ink taller than one image is read in bands that overlap by this much
  /// (points): a line up to this tall lies wholly in one of them.
  static let overlap: CGFloat = 200
  /// White around the ink (points), and the smallest image side.
  static let padding: CGFloat = 24
  static let minimumSide: CGFloat = 64
  /// Text smaller than this (points) is not looked for.
  static let smallestText: CGFloat = 8

  /// A part of the ink read as one image; a line counts for the band whose
  /// core holds its middle (the overlaps are read twice).
  struct Band {
    let rect: CGRect
    let coreTop: CGFloat
    let coreBottom: CGFloat
  }

  static func read(_ job: FPInkJob) -> FPInkOutcome {
    let request: FPInkRequest = job.request
    guard !request.strokes.isEmpty else { return .done([]) }
    // The ink's region, not the whole canvas: a page of a notebook may be
    // 20000 points tall with a few words on it.
    var ink = CGRect.null
    var boxes: [CGRect] = []
    let provisional: CGFloat = 2.5
    for stroke in request.strokes {
      let box: CGRect = bounds(of: stroke).insetBy(dx: -provisional, dy: -provisional)
      boxes.append(box)
      ink = ink.union(box)
    }
    var region: CGRect = padded(ink)
    let scale: CGFloat = min(preferredScale, maxPixels / region.width)
    // Very wide ink is scaled down; the image stays at least 64 pixels high.
    if region.height * scale < minimumSide {
      region = region.insetBy(dx: 0, dy: -(minimumSide / scale - region.height) / 2)
    }
    // About 2.5 points, and never thinner than 1.5 pixels.
    let lineWidth: CGFloat = max(2.5, 1.5 / scale)
    let languages: [String] = chooseLanguages(preferred: Locale.preferredLanguages, supported: FPInkRecognizer.supportedLanguages())
    var lines: [FPInkLine] = []
    for band in bands(region, scale: scale) {
      if job.isCancelled { return .cancelled }
      let reach: CGRect = band.rect.insetBy(dx: -lineWidth, dy: -lineWidth)
      guard boxes.contains(where: { $0.intersects(reach) }) else { continue }
      let outcome: FPInkOutcome = autoreleasepool { () -> FPInkOutcome in
        readBand(band, request: request, boxes: boxes, scale: scale, lineWidth: lineWidth, languages: languages, job: job)
      }
      switch outcome {
      case .done(let found):
        lines.append(contentsOf: found)
      case .cancelled, .failed:
        return outcome
      }
    }
    return .done(lines)
  }

  static func readBand(_ band: Band, request: FPInkRequest, boxes: [CGRect], scale: CGFloat, lineWidth: CGFloat, languages: [String], job: FPInkJob) -> FPInkOutcome {
    guard let image = render(request.strokes, boxes: boxes, region: band.rect, scale: scale, lineWidth: lineWidth) else {
      return .failed("The ink could not be drawn.")
    }
    let minimumHeight = Float(min(1.0 / 32.0, smallestText / band.rect.height))
    var observations: [VNRecognizedTextObservation]?
    do {
      observations = try recognize(image, languages: languages, minimumHeight: minimumHeight, job: job)
    } catch {
      if job.isCancelled { return .cancelled }
      // A combination of languages Vision refuses: once more with its own.
      guard !languages.isEmpty else { return .failed(error.localizedDescription) }
      do {
        observations = try recognize(image, languages: [], minimumHeight: minimumHeight, job: job)
      } catch {
        return job.isCancelled ? .cancelled : .failed(error.localizedDescription)
      }
    }
    guard let found = observations, !job.isCancelled else { return .cancelled }
    let pointsWide = CGFloat(image.width) / scale
    let pointsHigh = CGFloat(image.height) / scale
    var lines: [FPInkLine] = []
    for observation in found {
      guard let candidate = observation.topCandidates(1).first else { continue }
      let text: String = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { continue }
      // Vision's box is normalised with its origin bottom left.
      let box: CGRect = observation.boundingBox
      let rect = CGRect(
        x: band.rect.minX + box.minX * pointsWide,
        y: band.rect.minY + (1 - box.maxY) * pointsHigh,
        width: box.width * pointsWide,
        height: box.height * pointsHigh
      )
      let middle: CGFloat = rect.midY
      guard middle >= band.coreTop && middle < band.coreBottom else { continue }
      lines.append(FPInkLine(text: text, box: rect))
    }
    return .done(lines)
  }

  /// nil: the job was cancelled before Vision started.
  static func recognize(_ image: CGImage, languages: [String], minimumHeight: Float, job: FPInkJob) throws -> [VNRecognizedTextObservation]? {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if !languages.isEmpty {
      request.recognitionLanguages = languages
    }
    request.automaticallyDetectsLanguage = true
    request.minimumTextHeight = minimumHeight
    guard job.attach(request) else { return nil }
    defer { _ = job.attach(nil) }
    let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
    try handler.perform([request])
    let results: [VNRecognizedTextObservation] = request.results ?? []
    return results
  }

  static func bounds(of stroke: [CGPoint]) -> CGRect {
    guard let first = stroke.first else { return .null }
    var minX: CGFloat = first.x
    var minY: CGFloat = first.y
    var maxX: CGFloat = first.x
    var maxY: CGFloat = first.y
    for point in stroke {
      minX = min(minX, point.x)
      minY = min(minY, point.y)
      maxX = max(maxX, point.x)
      maxY = max(maxY, point.y)
    }
    return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
  }

  static func padded(_ ink: CGRect) -> CGRect {
    var rect: CGRect = ink.insetBy(dx: -padding, dy: -padding)
    if rect.width < minimumSide {
      rect = rect.insetBy(dx: -(minimumSide - rect.width) / 2, dy: 0)
    }
    if rect.height < minimumSide {
      rect = rect.insetBy(dx: 0, dy: -(minimumSide - rect.height) / 2)
    }
    return rect
  }

  /// The region in bands of at most maxPixels at this scale (one band when
  /// it fits). Wide ink is scaled down instead (scale), lines run across.
  static func bands(_ region: CGRect, scale: CGFloat) -> [Band] {
    let height: CGFloat = maxPixels / scale
    guard region.height > height else {
      return [Band(rect: region, coreTop: -CGFloat.infinity, coreBottom: CGFloat.infinity)]
    }
    let shared: CGFloat = min(overlap, height / 4)
    let step: CGFloat = height - shared
    var result: [Band] = []
    var top: CGFloat = region.minY
    while true {
      let bottom: CGFloat = min(top + height, region.maxY)
      let last: Bool = bottom >= region.maxY
      let band = Band(
        rect: CGRect(x: region.minX, y: top, width: region.width, height: bottom - top),
        coreTop: result.isEmpty ? -CGFloat.infinity : top + shared / 2,
        coreBottom: last ? CGFloat.infinity : bottom - shared / 2
      )
      result.append(band)
      if last { break }
      top += step
    }
    return result
  }

  static func pixels(_ value: CGFloat) -> Int {
    Int(min(maxPixels, max(1, value.rounded(.up))))
  }

  /// Black strokes on white, 8-bit grey, the region's top left at the
  /// image's top left.
  static func render(_ strokes: [[CGPoint]], boxes: [CGRect], region: CGRect, scale: CGFloat, lineWidth: CGFloat) -> CGImage? {
    let width: Int = pixels(region.width * scale)
    let height: Int = pixels(region.height * scale)
    guard let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceGray(),
      bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return nil }
    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    // The bitmap's origin is bottom left, the strokes' top left.
    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: scale, y: -scale)
    context.translateBy(x: -region.minX, y: -region.minY)
    context.setShouldAntialias(true)
    context.setStrokeColor(gray: 0, alpha: 1)
    context.setFillColor(gray: 0, alpha: 1)
    context.setLineWidth(lineWidth)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    let reach: CGRect = region.insetBy(dx: -lineWidth, dy: -lineWidth)
    for (index, stroke) in strokes.enumerated() {
      guard index < boxes.count, boxes[index].intersects(reach), let first = stroke.first else { continue }
      if stroke.count == 1 {
        context.fillEllipse(in: CGRect(x: first.x - lineWidth / 2, y: first.y - lineWidth / 2, width: lineWidth, height: lineWidth))
        continue
      }
      let path = CGMutablePath()
      path.move(to: first)
      if stroke.count == 2 {
        path.addLine(to: stroke[1])
      } else {
        // Through the midpoints with the points as control points: smooth,
        // like the page draws it.
        for i in 1..<(stroke.count - 1) {
          let point: CGPoint = stroke[i]
          let next: CGPoint = stroke[i + 1]
          path.addQuadCurve(to: CGPoint(x: (point.x + next.x) / 2, y: (point.y + next.y) / 2), control: point)
        }
        path.addLine(to: stroke[stroke.count - 1])
      }
      context.addPath(path)
      context.strokePath()
    }
    return context.makeImage()
  }

  /// The person's languages first (as Vision names them: "de-DE", "zh-Hant"),
  /// then German, English and French where Vision has them.
  static func chooseLanguages(preferred: [String], supported: [String]) -> [String] {
    var chosen: [String] = []
    for tag in preferred.prefix(4) {
      let normalized: String = tag.replacingOccurrences(of: "_", with: "-").lowercased()
      let exact: String? = supported.first(where: { $0.lowercased() == normalized })
      let prefix: String? = supported.first(where: { normalized.hasPrefix($0.lowercased() + "-") })
      let base: String? = supported.first(where: { baseLanguage($0) == baseLanguage(normalized) })
      if let match = exact ?? prefix ?? base, !chosen.contains(match) {
        chosen.append(match)
      }
    }
    for fallback in ["de-DE", "en-US", "fr-FR"] where supported.contains(fallback) && !chosen.contains(fallback) {
      chosen.append(fallback)
    }
    return chosen
  }

  static func baseLanguage(_ tag: String) -> String {
    let parts: [Substring] = tag.split(separator: "-")
    guard let first = parts.first else { return "" }
    return String(first).lowercased()
  }
}
