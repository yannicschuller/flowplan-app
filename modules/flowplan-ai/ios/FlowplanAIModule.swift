import ExpoModulesCore
import Foundation

/// Apple's on-device language model for the page's light AI actions
/// (README → On-device AI): the page asks through window.FlowplanApp.ai
/// (src/bridge-script.ts, src/ai-bridge.ts checks every request), the model
/// runs here (FlowplanAIModel.swift) – nothing of the text leaves the
/// device. On iOS before 26, without Apple Intelligence or on a device that
/// cannot run it, availability says why and every request is refused with
/// ERR_AI_UNAVAILABLE.
///
/// Also turns on Apple's Writing Tools in the page's web view
/// (FlowplanWritingTools.swift).
public class FlowplanAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowplanAI")

    // { id, text }: the answer so far while stream runs.
    Events("onChunk")

    OnCreate {
      FPWritingTools.install()
    }

    // { available, reason?, languages? } (modules/flowplan-ai/src/ai.ts).
    AsyncFunction("availability") { (promise: Promise) in
      promise.resolve(FPDeviceModel.availability())
    }

    // json: { id, instructions?, prompt, schema?, temperature?, maxTokens? }
    // (ai.ts aiPayload). Answers { text } or, with a schema, { json } (the
    // generated content as a JSON string). One request at a time: another
    // one meanwhile is refused with ERR_AI_BUSY.
    AsyncFunction("generate") { (json: String, promise: Promise) in
      FPDeviceModel.shared.run(json, streaming: false, onChunk: nil) { outcome in
        Self.settle(promise, outcome)
      }
    }

    // The same without a schema; the text so far goes out as "onChunk".
    AsyncFunction("stream") { (json: String, promise: Promise) in
      FPDeviceModel.shared.run(json, streaming: true, onChunk: { [weak self] id, text in
        self?.sendEvent("onChunk", ["id": id, "text": text])
      }) { outcome in
        Self.settle(promise, outcome)
      }
    }

    // Stops the request with this id (it rejects with ERR_AI_CANCELLED).
    Function("cancel") { (id: String) in
      FPDeviceModel.shared.cancel(id)
    }
  }

  private static func settle(_ promise: Promise, _ outcome: FPAIOutcome) {
    switch outcome {
    case .text(let text):
      promise.resolve(["text": text])
    case .json(let json):
      promise.resolve(["json": json])
    case .failed(let code, let message):
      promise.reject("ERR_AI_" + code.uppercased().replacingOccurrences(of: "-", with: "_"), message)
    }
  }
}
