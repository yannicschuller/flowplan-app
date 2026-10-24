import SwiftUI
import UIKit

/// The share sheet's state: what arrived, where it goes, saving.
@MainActor
final class FPSShareModel: ObservableObject {
  enum Phase: Equatable {
    case loading
    case signedOut
    case ready
    case saving
    case saved
  }

  @Published var phase: Phase = .loading
  @Published var title = ""
  @Published var text = ""
  @Published var link = ""
  @Published var files: [FPSFile] = []
  @Published var targets: [FPSTarget] = []
  @Published var target: FPSTarget?
  @Published var message = ""
  @Published var notice = ""
  private var maxFiles = 10
  private var maxUploadMb: Double = 25
  private let session: FPSSession?
  private let done: @MainActor (Bool) -> Void

  init(session: FPSSession?, done: @escaping @MainActor (Bool) -> Void) {
    self.session = session
    self.done = done
    if let lang = session?.lang, ["de", "en", "fr"].contains(lang) {
      FPSStrings.lang = lang
    }
  }

  func start(_ items: [NSExtensionItem]) async {
    guard let session = session, session.token != nil else {
      phase = .signedOut
      return
    }
    let content: FPSContent = await FPSLoader.content(of: items)
    title = content.title
    text = content.text
    link = content.link
    files = content.files
    if content.skipped > 0 { notice = FPSStrings.t("skipped") }
    do {
      let answer: FPSTargets = try await FPSAPI.targets(session: session)
      targets = answer.targets
      maxFiles = answer.maxFiles
      maxUploadMb = answer.maxUploadMb
      // The last target of this profile, else the inbox, else the first.
      let last: String? = FPSShared.defaults?.string(forKey: "flowplan.share.lastTarget." + session.profile)
      let remembered: FPSTarget? = targets.first { last != nil && ($0.inbox ? "inbox" : $0.id) == last }
      target = remembered ?? targets.first
      if targets.isEmpty { message = FPSStrings.t("noTargets") }
      if content.isEmpty { message = FPSStrings.t("nothing") }
      phase = .ready
    } catch {
      show(error)
      if case FPSError.signedOut = error {
        phase = .signedOut
      } else {
        phase = .ready
      }
    }
  }

  var canSave: Bool {
    guard phase == .ready, target != nil else { return false }
    let hasText: Bool = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let hasTitle: Bool = !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    return !files.isEmpty || !link.isEmpty || hasText || hasTitle
  }

  func save() async {
    guard let session = session, let target = target, canSave else { return }
    if files.count > maxFiles {
      message = FPSStrings.t("tooMany", ["count": String(maxFiles)])
      return
    }
    let maxBytes = Int(maxUploadMb * 1024 * 1024)
    if let large = files.first(where: { $0.data.count > maxBytes }) {
      message = FPSStrings.t("tooLarge", ["name": large.name, "mb": String(Int(maxUploadMb))])
      return
    }
    phase = .saving
    message = ""
    let cleanTitle: String = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanText: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
    do {
      try await FPSAPI.save(session: session, target: target, title: cleanTitle, text: cleanText, link: link, files: files)
      phase = .saved
      UINotificationFeedbackGenerator().notificationOccurred(.success)
      try? await Task.sleep(nanoseconds: 900_000_000)
      done(true)
    } catch {
      phase = .ready
      UINotificationFeedbackGenerator().notificationOccurred(.error)
      show(error)
    }
  }

  func cancel() {
    done(false)
  }

  private func show(_ error: Error) {
    switch error {
    case FPSError.signedOut:
      message = FPSStrings.t("signIn")
    case FPSError.offline:
      message = FPSStrings.t("failed", ["error": FPSStrings.t("offline")])
    case FPSError.server(let text):
      message = FPSStrings.t("failed", ["error": text])
    default:
      message = FPSStrings.t("failed", ["error": error.localizedDescription])
    }
  }
}

/// A compact sheet: title, text, link and files at the top, the target
/// below (a searchable list), Save in the corner.
struct FPSShareView: View {
  @ObservedObject var model: FPSShareModel

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(FPSStrings.t("heading"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(FPSStrings.t("cancel")) { model.cancel() }
          }
          ToolbarItem(placement: .confirmationAction) {
            if model.phase == .saving {
              ProgressView()
            } else if model.phase == .ready {
              Button(FPSStrings.t("save")) {
                Task { await model.save() }
              }
              .fontWeight(.semibold)
              .disabled(!model.canSave)
            }
          }
        }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch model.phase {
    case .loading:
      VStack(spacing: 12) {
        ProgressView()
        Text(FPSStrings.t("loading")).foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    case .signedOut:
      VStack(spacing: 16) {
        Image(systemName: "person.crop.circle.badge.exclamationmark")
          .font(.system(size: 44))
          .foregroundStyle(.secondary)
        Text(FPSStrings.t("signIn"))
          .multilineTextAlignment(.center)
        Button(FPSStrings.t("close")) { model.cancel() }
          .buttonStyle(.borderedProminent)
      }
      .padding(24)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    case .saved:
      VStack(spacing: 12) {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 48))
          .foregroundStyle(.green)
        Text(FPSStrings.t("saved", ["target": model.target?.label ?? ""]))
          .multilineTextAlignment(.center)
      }
      .padding(24)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    case .ready, .saving:
      form
    }
  }

  private var form: some View {
    Form {
      Section {
        TextField(FPSStrings.t("titleField"), text: $model.title)
        if !model.link.isEmpty {
          Label(model.link, systemImage: "link")
            .font(.callout)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        TextField(FPSStrings.t("textField"), text: $model.text, axis: .vertical)
          .lineLimit(2...6)
        if !model.files.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach(model.files) { file in
                FPSFileThumb(file: file)
              }
            }
            .padding(.vertical, 4)
          }
        }
      }
      Section(FPSStrings.t("target")) {
        NavigationLink {
          FPSTargetList(model: model)
        } label: {
          FPSTargetRow(target: model.target, selected: false)
        }
        .disabled(model.targets.isEmpty)
      }
      if !model.message.isEmpty || !model.notice.isEmpty {
        Section {
          if !model.message.isEmpty {
            Text(model.message).foregroundStyle(.red)
          }
          if !model.notice.isEmpty {
            Text(model.notice).foregroundStyle(.secondary)
          }
        }
        .font(.footnote)
      }
    }
    .disabled(model.phase == .saving)
  }
}

struct FPSTargetRow: View {
  let target: FPSTarget?
  let selected: Bool

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(target?.label ?? "–")
          .foregroundStyle(.primary)
          .lineLimit(1)
        if let target = target {
          Text(target.detail)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      Spacer()
      if selected {
        Image(systemName: "checkmark").foregroundStyle(.tint)
      }
    }
  }
}

struct FPSFileThumb: View {
  let file: FPSFile

  var body: some View {
    VStack(spacing: 4) {
      thumb
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 8))
      Text(file.name)
        .font(.caption2)
        .lineLimit(1)
        .frame(width: 64)
    }
  }

  @ViewBuilder
  private var thumb: some View {
    if let preview = file.preview {
      Image(uiImage: preview)
        .resizable()
        .scaledToFill()
    } else {
      Image(systemName: "doc.richtext")
        .font(.title)
        .foregroundStyle(.secondary)
        .frame(width: 64, height: 64)
        .background(Color(uiColor: .secondarySystemBackground))
    }
  }
}

struct FPSTargetList: View {
  @ObservedObject var model: FPSShareModel
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""

  private var shown: [FPSTarget] {
    let q: String = query.trimmingCharacters(in: .whitespaces).lowercased()
    if q.isEmpty { return model.targets }
    return model.targets.filter { target in
      target.name.lowercased().contains(q) || target.place.lowercased().contains(q)
    }
  }

  var body: some View {
    List(shown) { target in
      Button {
        model.target = target
        dismiss()
      } label: {
        FPSTargetRow(target: target, selected: model.target == target)
      }
    }
    .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: FPSStrings.t("search"))
    .navigationTitle(FPSStrings.t("target"))
  }
}
