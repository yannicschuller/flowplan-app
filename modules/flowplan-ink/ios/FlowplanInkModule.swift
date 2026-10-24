import ExpoModulesCore
import Foundation

/// Handwriting recognition for the page's ink (notebooks, PDF annotations,
/// drawings; README → Handwriting): the page's strokes are drawn black on
/// white into an image and read by Vision on the device
/// (FlowplanInkRecognizer.swift). The page asks through
/// window.FlowplanApp.recognizeInk (src/ink-bridge.ts), only where
/// isAvailable says yes.
public class FlowplanInkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowplanInk")

    // Whether Vision can read text here (it knows at least one language).
    Function("isAvailable") { () -> Bool in
      FPInkRecognizer.isAvailable
    }

    // json: { id, width, height, strokes: [[x0, y0, x1, y1, …]] } in points,
    // origin top left (modules/flowplan-ink/src/ink.ts inkPayload). Answers
    // { lines: [{ text, box: [x, y, width, height] }] } in the same points.
    // A newer request for the same id cancels this one (ERR_INK_CANCELLED).
    AsyncFunction("recognize") { (json: String, promise: Promise) in
      guard let request = FPInkRequest.parse(json) else {
        promise.reject("ERR_INK_REQUEST", "invalid")
        return
      }
      FPInkRecognizer.shared.recognize(request) { outcome in
        switch outcome {
        case .done(let lines):
          promise.resolve(["lines": lines.map { $0.dictionary }])
        case .cancelled:
          promise.reject("ERR_INK_CANCELLED", "cancelled")
        case .failed(let message):
          promise.reject("ERR_INK_FAILED", message)
        }
      }
    }
  }
}
