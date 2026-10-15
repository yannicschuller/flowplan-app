import Capacitor
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var shell: ShellViewController? { window?.rootViewController as? ShellViewController }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ShellViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        for context in connectionOptions.urlContexts { open(context.url) }
        if let shortcut = connectionOptions.shortcutItem { perform(shortcut) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts where !open(context.url) {
            SceneDelegateProxy.shared.scene(scene, openURLContexts: [context])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // Quick action on the app icon: "Change server".
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(perform(shortcutItem))
    }

    @discardableResult
    private func perform(_ shortcut: UIApplicationShortcutItem) -> Bool {
        guard shortcut.type == "app.flowplan.mobile.change-server" else { return false }
        return open(URL(string: "flowplan://change-server")!)
    }

    // flowplan://sign-in and flowplan://change-server
    @discardableResult
    private func open(_ url: URL) -> Bool {
        shell?.bridgeController.shell.handle(url) ?? false
    }
}
