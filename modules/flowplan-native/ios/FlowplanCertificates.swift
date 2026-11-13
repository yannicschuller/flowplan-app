import Foundation
import Security

/// The certificate an HTTPS instance presents, for the app's certificate
/// dialog (src/certs/review.ts): the chain as base64 DER, leaf first, and
/// whether iOS trusts it for that host (the TLS challenge's trust
/// evaluation – a CA the person installed and fully trusted in Settings
/// counts, as it does for WKWebView and URLSession).
///
/// The challenge is answered with "cancel" in every case: no request reaches
/// the instance and nothing is trusted here. On iOS the app pins no
/// certificates – the dialog explains how to install and trust one instead
/// (src/certs/review.ts says why).
final class FlowplanCertificateInspector: NSObject, URLSessionDelegate {
  private var chain: [String] = []
  private var trusted = false
  private var seen = false

  static func inspect(_ origin: String, completion: @escaping ([String: Any]?) -> Void) {
    guard let url = URL(string: origin + "/api/health"), url.scheme == "https", url.host != nil else {
      completion(nil)
      return
    }
    let inspector = FlowplanCertificateInspector()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    // The delegate's queue runs the challenge and the completion one after the other.
    let session = URLSession(configuration: configuration, delegate: inspector, delegateQueue: nil)
    session.dataTask(with: URLRequest(url: url)) { _, _, _ in
      session.invalidateAndCancel()
      completion(inspector.seen ? ["chain": inspector.chain, "trusted": inspector.trusted] : nil)
    }.resume()
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust
    else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    seen = true
    trusted = SecTrustEvaluateWithError(trust, nil)
    if let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate] {
      chain = certificates.map { (SecCertificateCopyData($0) as Data).base64EncodedString() }
    }
    // Never "use credential": the connection ends here.
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}
