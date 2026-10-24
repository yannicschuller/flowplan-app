import SwiftUI
import UIKit

/// "Flowplan" in the share sheet of other apps (links, text, images, PDFs):
/// the extension's principal class (Info.plist NSExtensionPrincipalClass),
/// showing FPSShareView.
final class ShareViewController: UIViewController {
  private var model: FPSShareModel?

  override func viewDidLoad() {
    super.viewDidLoad()
    let model = FPSShareModel(session: FPSKeychain.load()) { [weak self] saved in
      self?.finish(saved)
    }
    self.model = model
    let host = UIHostingController(rootView: FPSShareView(model: model))
    addChild(host)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(host.view)
    NSLayoutConstraint.activate([
      host.view.topAnchor.constraint(equalTo: view.topAnchor),
      host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
    host.didMove(toParent: self)
    let items: [NSExtensionItem] = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
    Task {
      await model.start(items)
    }
  }

  private func finish(_ saved: Bool) {
    if saved {
      extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    } else {
      extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
  }
}
