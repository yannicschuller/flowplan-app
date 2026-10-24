import CoreSpotlight
import ExpoModulesCore

/// A tap on a Flowplan result in Spotlight continues the app with a user
/// activity (the scene delegate forwards it here, also on a cold start):
/// its identifier holds the path to open (FPCLinks).
public class FlowplanCaptureAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([any UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard userActivity.activityType == CSSearchableItemActionType else { return false }
    guard let identifier = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String else { return false }
    guard let path = FPCLinks.path(of: identifier) else { return false }
    FPCLinks.open(path: path)
    return true
  }
}
