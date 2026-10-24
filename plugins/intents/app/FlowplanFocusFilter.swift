import AppIntents
import Foundation

// Focus filters (Settings → Focus → a Focus → Add filter → Flowplan): a
// profile, or one workspace of it, per Focus, and optionally no push
// notifications from the other workspaces meanwhile.
//
// - The app (src/native/intents.ts) switches to the profile and opens the
//   workspace when the Focus starts, and goes back to the profile before
//   when it ends. It reads the filter from the App Group's UserDefaults:
//
//     flowplan.focus.filter  JSON text, written on every change:
//       { "active": true, "at": <seconds>, "profile": "<profile id>",
//         "profileName": "…", "workspace": "<uuid>" | null,
//         "workspaceName": "…", "hideNotifications": true|false }
//       or { "active": false, "at": <seconds> } after the Focus ended.
//
//   The widgets may read the same key to show only the Focus's profile or
//   workspace (not done yet).
// - Push notifications: the instance of the active profile is told to hold
//   back those of other workspaces – or all of them, when the Focus is for
//   another profile (POST /api/mobile/intents/focus). They stay in the inbox.
//
// What there is to choose comes from the app (flowplan.intents.profiles,
// written by the FlowplanIntents module) and the active profile's instance
// (its workspaces, kept per profile in flowplan.intents.workspaces.<id>).

enum FPFocusKeys {
  static let filter = "flowplan.focus.filter"
  static let profiles = "flowplan.intents.profiles"
  static func workspaces(_ profile: String) -> String { "flowplan.intents.workspaces." + profile }
}

/// A profile ("<profile>") or one of its workspaces ("<profile>/<uuid>").
struct FPFocusSpace: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Profile or workspace"
  static var defaultQuery = FPFocusSpaceQuery()

  let id: String
  let name: String
  let detail: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(detail)")
  }

  var profile: String {
    String(id.split(separator: "/").first ?? "")
  }
  var workspace: String? {
    let parts = id.split(separator: "/")
    return parts.count > 1 ? String(parts[1]) : nil
  }
}

enum FPFocusSpaces {
  struct Profile {
    let id: String
    let name: String
    let server: String
  }

  static func profiles() -> (list: [Profile], active: String?) {
    guard let text = FPShared.defaults?.string(forKey: FPFocusKeys.profiles) else { return ([], nil) }
    let json = FPJSON(data: text.data(using: .utf8))
    let list: [Profile] = json["profiles"].array.compactMap { entry -> Profile? in
      guard let id = entry["id"].string else { return nil }
      return Profile(id: id, name: entry["name"].text, server: entry["server"].text)
    }
    return (list, json["active"].string)
  }

  /// The workspaces last seen of a profile.
  static func cachedWorkspaces(_ profile: String) -> [FPJSON] {
    guard let text = FPShared.defaults?.string(forKey: FPFocusKeys.workspaces(profile)) else { return [] }
    return FPJSON(data: text.data(using: .utf8)).array
  }

  /// Asks the active profile's instance; keeps the answer for later.
  static func fetchWorkspaces(_ profile: String) async -> [FPJSON] {
    guard let answer = try? await FPIntentAPI.get("workspaces") else { return cachedWorkspaces(profile) }
    let list: [FPJSON] = answer["workspaces"].array
    let raw: [Any] = list.compactMap { $0.raw }
    if let data = try? JSONSerialization.data(withJSONObject: raw), let text = String(data: data, encoding: .utf8) {
      FPShared.defaults?.set(text, forKey: FPFocusKeys.workspaces(profile))
    }
    return list
  }

  static func all(fetch: Bool) async -> [FPFocusSpace] {
    let (list, active) = profiles()
    let session: FPSession? = FPKeychain.load()
    var out: [FPFocusSpace] = []
    for profile in list {
      let host: String = URL(string: profile.server)?.host ?? profile.server
      out.append(FPFocusSpace(id: profile.id, name: profile.name, detail: L("All workspaces") + " · " + host))
      let online: Bool = fetch && profile.id == active && session?.profile == profile.id
      var workspaces: [FPJSON] = cachedWorkspaces(profile.id)
      if online {
        workspaces = await fetchWorkspaces(profile.id)
      }
      for workspace in workspaces {
        guard let id = workspace["id"].string else { continue }
        out.append(FPFocusSpace(id: profile.id + "/" + id, name: workspace["name"].text, detail: profile.name))
      }
    }
    return out
  }
}

struct FPFocusSpaceQuery: EntityQuery {
  init() {}

  func entities(for identifiers: [String]) async throws -> [FPFocusSpace] {
    let known = await FPFocusSpaces.all(fetch: false)
    return identifiers.map { id in
      known.first(where: { $0.id == id }) ?? FPFocusSpace(id: id, name: "Flowplan", detail: "")
    }
  }

  func suggestedEntities() async throws -> [FPFocusSpace] {
    await FPFocusSpaces.all(fetch: true)
  }
}

struct FPFocusFilterIntent: SetFocusFilterIntent {
  static var title: LocalizedStringResource = "Flowplan focus"
  static var description: IntentDescription? = IntentDescription("Shows one profile or workspace while this Focus is on.")

  @Parameter(title: "Profile or workspace")
  var space: FPFocusSpace?

  @Parameter(title: "Hide notifications from other workspaces", default: false)
  var hideNotifications: Bool

  init() {}

  var displayRepresentation: DisplayRepresentation {
    let hidden: LocalizedStringResource = "Other notifications hidden"
    let usual: LocalizedStringResource = "Notifications as usual"
    guard let space else { return DisplayRepresentation(title: "Flowplan") }
    return DisplayRepresentation(title: "\(space.name)", subtitle: hideNotifications ? hidden : usual)
  }

  // Called when the Focus starts, when its filter changes and – with no
  // space – when it ends.
  func perform() async throws -> some IntentResult {
    FPFocusState.apply(space: space, hide: hideNotifications)
    await FPFocusState.tellInstance(space: space, hide: hideNotifications)
    return .result()
  }
}

enum FPFocusState {
  static func apply(space: FPFocusSpace?, hide: Bool) {
    var state: [String: Any] = ["active": space != nil, "at": Date().timeIntervalSince1970]
    if let space {
      let profiles = FPFocusSpaces.profiles().list
      let profileName: String = profiles.first(where: { $0.id == space.profile })?.name ?? ""
      state["profile"] = space.profile
      state["profileName"] = profileName
      if let workspace = space.workspace {
        state["workspace"] = workspace
        state["workspaceName"] = space.name
      } else {
        state["workspace"] = NSNull()
        state["workspaceName"] = ""
      }
      state["hideNotifications"] = hide
    }
    if let data = try? JSONSerialization.data(withJSONObject: state), let text = String(data: data, encoding: .utf8) {
      FPShared.defaults?.set(text, forKey: FPFocusKeys.filter)
    }
    NotificationCenter.default.post(name: Notification.Name("FlowplanFocusFilter"), object: nil)
    FPWidgets.reloadAll()
  }

  /// The push rule on the active profile's instance; best effort (the app
  /// sends it again after switching profiles).
  static func tellInstance(space: FPFocusSpace?, hide: Bool) async {
    guard let session = FPKeychain.load(), session.token != nil else { return }
    var body: [String: Any] = ["hide": false]
    if let space, hide {
      if space.profile != session.profile {
        body = ["hide": true, "workspaceId": NSNull()]
      } else if let workspace = space.workspace {
        body = ["hide": true, "workspaceId": workspace]
      }
    }
    _ = try? await FPIntentAPI.post("focus", body)
  }
}
