import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

/// The phone's search: one domain per profile (only the active one is
/// indexed). Entries come finished from JavaScript (src/spotlight.ts):
/// titles and descriptions in the person's language.
enum FPCSpotlight {
  // Entries the app has not refreshed in a month disappear by themselves.
  private static let keep: TimeInterval = 30 * 86_400

  static func replace(domain: String, json: String, completion: @escaping (Int, Error?) -> Void) {
    let items: [CSSearchableItem] = parse(json, domain: domain)
    let index = CSSearchableIndex.default()
    index.deleteSearchableItems(withDomainIdentifiers: [domain]) { error in
      if let error = error {
        completion(0, error)
        return
      }
      guard !items.isEmpty else {
        completion(0, nil)
        return
      }
      index.indexSearchableItems(items) { error in
        completion(error == nil ? items.count : 0, error)
      }
    }
  }

  static func clear(completion: @escaping (Error?) -> Void) {
    CSSearchableIndex.default().deleteAllSearchableItems(completionHandler: completion)
  }

  static func parse(_ json: String, domain: String) -> [CSSearchableItem] {
    guard let data = json.data(using: .utf8),
          let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
    let expires = Date().addingTimeInterval(keep)
    var items: [CSSearchableItem] = []
    for entry in list {
      guard let id = entry["id"] as? String,
            let path = entry["path"] as? String,
            let title = entry["title"] as? String,
            !title.isEmpty else { continue }
      let attributes = CSSearchableItemAttributeSet(contentType: UTType.text)
      attributes.title = title
      attributes.displayName = title
      attributes.contentDescription = entry["description"] as? String
      attributes.keywords = entry["keywords"] as? [String]
      if let updated = entry["updatedAt"] as? NSNumber {
        attributes.contentModificationDate = Date(timeIntervalSince1970: updated.doubleValue / 1000)
      }
      if let due = entry["due"] as? NSNumber {
        attributes.dueDate = Date(timeIntervalSince1970: due.doubleValue / 1000)
      }
      let identifier: String = FPCLinks.identifier(id: id, path: path)
      let item = CSSearchableItem(uniqueIdentifier: identifier, domainIdentifier: domain, attributeSet: attributes)
      item.expirationDate = expires
      items.append(item)
    }
    return items
  }
}
