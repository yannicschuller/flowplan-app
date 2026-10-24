import ExpoModulesCore
import Foundation
import Speech

/// Speech to text for the app's voice notes (src/screens/VoiceNote.tsx)
/// with Apple Speech – only on the device: the recording never leaves the
/// phone for this. Languages without on-device recognition are reported as
/// unavailable; the app then leaves the text to the instance (Whisper) or
/// inserts the audio alone.
public class FlowplanSpeechModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowplanSpeech")

    // Whether recordings in this language (BCP 47, nil: the phone's) can be
    // transcribed on the device; asks for no permission.
    Function("onDevice") { (language: String?) -> Bool in
      guard let recognizer = SFSpeechRecognizer(locale: FPTranscription.locale(language)) else { return false }
      return recognizer.supportsOnDeviceRecognition
    }

    // { text, words: [{ text, start, duration }] } of an audio file
    // (file:// URI); asks for the speech recognition permission the first
    // time. Fails with "denied", "unavailable" or the recognizer's message.
    AsyncFunction("transcribe") { (uri: String, language: String?, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL else {
        promise.reject("ERR_SPEECH_FILE", "Not a file")
        return
      }
      SFSpeechRecognizer.requestAuthorization { status in
        guard status == .authorized else {
          promise.reject("ERR_SPEECH_DENIED", "denied")
          return
        }
        FPTranscription.start(url: url, locale: FPTranscription.locale(language)) { result, error in
          if let result = result {
            promise.resolve(result)
          } else {
            promise.reject("ERR_SPEECH", error ?? "unavailable")
          }
        }
      }
    }
  }
}

/// One recognition; kept alive (with its recognizer) until it is done.
final class FPTranscription {
  private static var running: [UUID: FPTranscription] = [:]
  private let id = UUID()
  private var recognizer: SFSpeechRecognizer?
  private var task: SFSpeechRecognitionTask?
  private var finished = false

  static func locale(_ language: String?) -> Locale {
    if let language = language, !language.isEmpty {
      return Locale(identifier: language)
    }
    return Locale.current
  }

  static func start(url: URL, locale: Locale, done: @escaping ([String: Any]?, String?) -> Void) {
    DispatchQueue.main.async {
      let job = FPTranscription()
      running[job.id] = job
      job.begin(url: url, locale: locale) { result, error in
        DispatchQueue.main.async {
          running[job.id] = nil
          done(result, error)
        }
      }
    }
  }

  private func begin(url: URL, locale: Locale, finish: @escaping ([String: Any]?, String?) -> Void) {
    guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
      finish(nil, "unavailable")
      return
    }
    guard recognizer.supportsOnDeviceRecognition else {
      finish(nil, "unavailable")
      return
    }
    self.recognizer = recognizer
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false
    request.taskHint = .dictation
    request.addsPunctuation = true
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self = self, !self.finished else { return }
      if let result = result, result.isFinal {
        self.finished = true
        finish(Self.serialize(result.bestTranscription), nil)
      } else if let error = error {
        self.finished = true
        finish(nil, error.localizedDescription)
      }
    }
  }

  private static func serialize(_ transcription: SFTranscription) -> [String: Any] {
    var words: [[String: Any]] = []
    for segment in transcription.segments {
      let word: [String: Any] = ["text": segment.substring, "start": segment.timestamp, "duration": segment.duration]
      words.append(word)
    }
    return ["text": transcription.formattedString, "words": words]
  }
}
