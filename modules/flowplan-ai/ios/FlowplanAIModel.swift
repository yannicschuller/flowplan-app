import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// The page's request (src/ai-bridge.ts checked it already; checked again
/// here).
struct FPAIRequest {
  static let maxPrompt = 40_000
  static let maxInstructions = 8_000
  static let maxTokens = 4096

  let id: String
  let instructions: String
  let prompt: String
  let schema: [String: Any]?
  let temperature: Double?
  let maxTokens: Int?

  /// { id, instructions?, prompt, schema?, temperature?, maxTokens? }
  /// (modules/flowplan-ai/src/ai.ts aiPayload).
  static func parse(_ json: String) -> FPAIRequest? {
    guard let data = json.data(using: .utf8),
          let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let id = object["id"] as? String,
          !id.isEmpty, id.count <= 100,
          let prompt = object["prompt"] as? String,
          !prompt.isEmpty, prompt.count <= maxPrompt else { return nil }
    let instructions = (object["instructions"] as? String) ?? ""
    guard instructions.count <= maxInstructions else { return nil }
    var temperature: Double?
    if let value = (object["temperature"] as? NSNumber)?.doubleValue, value.isFinite {
      temperature = min(max(value, 0), 2)
    }
    var tokens: Int?
    if let value = (object["maxTokens"] as? NSNumber)?.doubleValue, value.isFinite {
      tokens = Int(min(max(value, 1), Double(maxTokens)))
    }
    return FPAIRequest(id: id, instructions: instructions, prompt: prompt, schema: object["schema"] as? [String: Any], temperature: temperature, maxTokens: tokens)
  }
}

enum FPAIOutcome {
  case text(String)
  case json(String)
  /// code: unavailable, context-too-long, guardrail, cancelled, busy, error.
  case failed(String, String)
}

/// One request at a time (the model runs one answer per app well, and the
/// page never needs two): another one meanwhile is "busy". cancel stops the
/// running one through its task.
final class FPDeviceModel {
  static let shared = FPDeviceModel()

  private let lock = NSLock()
  private var running: (token: UUID, id: String, cancel: () -> Void)?

  static func availability() -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return FPFoundationModel.availability()
    }
    #endif
    return ["available": false, "reason": "unsupported-os"]
  }

  func run(_ json: String, streaming: Bool, onChunk: ((String, String) -> Void)?, completion: @escaping (FPAIOutcome) -> Void) {
    guard let request = FPAIRequest.parse(json) else {
      completion(.failed("error", "Invalid request."))
      return
    }
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      let token = UUID()
      lock.lock()
      if running != nil {
        lock.unlock()
        completion(.failed("busy", "Another request is running."))
        return
      }
      let task = Task.detached(priority: .userInitiated) { [weak self] in
        let outcome: FPAIOutcome = await FPFoundationModel.respond(request, streaming: streaming) { text in
          onChunk?(request.id, text)
        }
        self?.finish(token)
        completion(outcome)
      }
      running = (token, request.id, { task.cancel() })
      lock.unlock()
      return
    }
    #endif
    completion(.failed("unavailable", "unsupported-os"))
  }

  func cancel(_ id: String) {
    lock.lock()
    let stop: (() -> Void)? = running?.id == id ? running?.cancel : nil
    lock.unlock()
    stop?()
  }

  private func finish(_ token: UUID) {
    lock.lock()
    if running?.token == token {
      running = nil
    }
    lock.unlock()
  }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
enum FPFoundationModel {
  /// Seconds between two "onChunk" events: the page re-renders on each.
  static let chunkInterval: TimeInterval = 0.06

  static func availability() -> [String: Any] {
    let model = SystemLanguageModel.default
    let languages: [String] = Array(Set(model.supportedLanguages.compactMap { $0.languageCode?.identifier })).sorted()
    switch model.availability {
    case .available:
      return ["available": true, "languages": languages]
    case .unavailable(let reason):
      let code: String
      switch reason {
      case .deviceNotEligible:
        code = "device-not-eligible"
      case .appleIntelligenceNotEnabled:
        code = "apple-intelligence-off"
      case .modelNotReady:
        code = "model-not-ready"
      @unknown default:
        code = "error"
      }
      return ["available": false, "reason": code, "languages": languages]
    }
  }

  static func respond(_ request: FPAIRequest, streaming: Bool, onChunk: @escaping (String) -> Void) async -> FPAIOutcome {
    let model = SystemLanguageModel.default
    guard case .available = model.availability else {
      return .failed("unavailable", "The on-device model is not available.")
    }
    let instructions: String = request.instructions
    let prompt: String = request.prompt
    // A session of its own for every request: nothing of one page's text
    // stays for the next.
    let session = LanguageModelSession(model: model, instructions: { instructions })
    var options = GenerationOptions()
    if let temperature = request.temperature {
      options.temperature = temperature
    }
    if let tokens = request.maxTokens {
      options.maximumResponseTokens = tokens
    }
    do {
      if let raw = request.schema {
        guard let root = FPSchema.build(raw, name: "Result", depth: 0) else {
          return .failed("error", "Unsupported schema.")
        }
        let schema = try GenerationSchema(root: root, dependencies: [])
        let response = try await session.respond(to: Prompt { prompt }, schema: schema, includeSchemaInPrompt: true, options: options)
        try Task.checkCancellation()
        return .json(response.content.jsonString)
      }
      if streaming {
        var text = ""
        var sent = Date.distantPast
        for try await snapshot in session.streamResponse(to: Prompt { prompt }, options: options) {
          try Task.checkCancellation()
          text = snapshot.content
          if Date().timeIntervalSince(sent) >= chunkInterval {
            sent = Date()
            onChunk(text)
          }
        }
        try Task.checkCancellation()
        onChunk(text)
        return .text(text)
      }
      let response = try await session.respond(to: Prompt { prompt }, options: options)
      try Task.checkCancellation()
      return .text(response.content)
    } catch {
      return failure(error)
    }
  }

  static func failure(_ error: Error) -> FPAIOutcome {
    if error is CancellationError || Task.isCancelled {
      return .failed("cancelled", "Cancelled.")
    }
    let message = String(describing: error)
    if let generation = error as? LanguageModelSession.GenerationError {
      switch generation {
      case .exceededContextWindowSize:
        return .failed("context-too-long", message)
      case .guardrailViolation, .refusal:
        return .failed("guardrail", message)
      case .assetsUnavailable, .unsupportedLanguageOrLocale:
        return .failed("unavailable", message)
      case .rateLimited, .concurrentRequests:
        return .failed("busy", message)
      default:
        return .failed("error", message)
      }
    }
    // Newer systems throw errors of other types (LanguageModelError): by
    // their name.
    let name = message.lowercased()
    if name.contains("context") && (name.contains("exceed") || name.contains("size")) {
      return .failed("context-too-long", message)
    }
    if name.contains("guardrail") || name.contains("refusal") {
      return .failed("guardrail", message)
    }
    if name.contains("concurrent") || name.contains("ratelimit") {
      return .failed("busy", message)
    }
    if name.contains("assetsunavailable") || name.contains("unsupportedlanguage") {
      return .failed("unavailable", message)
    }
    return .failed("error", message)
  }
}

/// The page's JSON Schema subset, already ordered (ai.ts aiSchema): object
/// { properties: [{ name, description?, optional, schema }] }, array
/// { items, minItems?, maxItems? }, string (with enum), number, integer,
/// boolean.
@available(iOS 26.0, *)
enum FPSchema {
  static let maxDepth = 6

  static func build(_ node: [String: Any], name: String, depth: Int) -> DynamicGenerationSchema? {
    guard depth <= maxDepth, let type = node["type"] as? String else { return nil }
    let description = node["description"] as? String
    switch type {
    case "object":
      guard let list = node["properties"] as? [[String: Any]], !list.isEmpty else { return nil }
      var properties: [DynamicGenerationSchema.Property] = []
      for entry in list {
        guard let key = entry["name"] as? String, !key.isEmpty,
              let child = entry["schema"] as? [String: Any],
              let schema = build(child, name: "\(name)_\(key)", depth: depth + 1) else { return nil }
        properties.append(DynamicGenerationSchema.Property(name: key, description: entry["description"] as? String, schema: schema, isOptional: (entry["optional"] as? Bool) ?? false))
      }
      return DynamicGenerationSchema(name: name, description: description, properties: properties)
    case "array":
      guard let items = node["items"] as? [String: Any], let element = build(items, name: "\(name)_item", depth: depth + 1) else { return nil }
      return DynamicGenerationSchema(arrayOf: element, minimumElements: (node["minItems"] as? NSNumber)?.intValue, maximumElements: (node["maxItems"] as? NSNumber)?.intValue)
    case "string":
      if let choices = node["enum"] as? [String], !choices.isEmpty {
        return DynamicGenerationSchema(type: String.self, guides: [.anyOf(choices)])
      }
      return DynamicGenerationSchema(type: String.self, guides: [])
    case "number":
      return DynamicGenerationSchema(type: Double.self, guides: [])
    case "integer":
      return DynamicGenerationSchema(type: Int.self, guides: [])
    case "boolean":
      return DynamicGenerationSchema(type: Bool.self, guides: [])
    default:
      return nil
    }
  }
}
#endif
