package app.flowplan.nativeshell;

import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ClientCertRequest;
import android.webkit.HttpAuthHandler;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SafeBrowsingResponse;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The web view's side of the pinned certificates (src/certs/pins.ts, CertificatePins.kt).
 *
 * react-native-webview's client cancels every certificate error (RNCWebViewClient.onReceivedSslError)
 * and has no hook to decide otherwise, so the app puts this client in front of it: everything goes to
 * react-native-webview's client as before – except a certificate error for a page of a pinned host
 * whose certificate is exactly the pinned one, which proceeds. Any other host, any other certificate
 * and every other error reach react-native-webview unchanged, which cancels them and reports them to
 * the page's onError (src/certs/shell.ts asks the person then).
 *
 * Armed from JavaScript (FlowplanNativeModule → armWebViews) on the window's first certificate error
 * of a pinned instance; then the page loads again. Every callback react-native-webview's client
 * overrides is forwarded (test/certs-native.test.ts checks this against the installed version).
 */
public class PinnedWebViewClient extends WebViewClient {
  private final WebViewClient delegate;

  PinnedWebViewClient(WebViewClient delegate) {
    this.delegate = delegate != null ? delegate : new WebViewClient();
  }

  @Override
  public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
    String url = error != null ? error.getUrl() : null;
    String host = url != null ? Uri.parse(url).getHost() : null;
    byte[] der = error != null ? certificateDer(error.getCertificate()) : null;
    // Only the pinned certificate, only on its host (CertificatePins.matches).
    if (CertificatePins.matches(host, der)) {
      handler.proceed();
      return;
    }
    delegate.onReceivedSslError(view, handler, error);
  }

  // The certificate's DER: SslCertificate has it from Android 10; before, only in its saved state
  // (the key the platform has always used).
  static byte[] certificateDer(SslCertificate certificate) {
    if (certificate == null) return null;
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        java.security.cert.X509Certificate x509 = certificate.getX509Certificate();
        return x509 != null ? x509.getEncoded() : null;
      }
      Bundle state = SslCertificate.saveState(certificate);
      return state != null ? state.getByteArray("x509-certificate") : null;
    } catch (Exception error) {
      return null;
    }
  }

  // Puts this client in front of every web view under `root` that does not have it yet; answers how
  // many it armed. Main thread.
  static int arm(View root) {
    if (root instanceof WebView) {
      WebView web = (WebView) root;
      WebViewClient current = web.getWebViewClient();
      if (current instanceof PinnedWebViewClient) return 0;
      web.setWebViewClient(new PinnedWebViewClient(current));
      return 1;
    }
    int armed = 0;
    if (root instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) root;
      for (int i = 0; i < group.getChildCount(); i++) armed += arm(group.getChildAt(i));
    }
    return armed;
  }

  // A pin removed: the web views forget the certificate errors they let through (Chromium remembers
  // them for the session). Main thread.
  static void clearDecisions(View root) {
    if (root instanceof WebView) {
      ((WebView) root).clearSslPreferences();
      return;
    }
    if (root instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) root;
      for (int i = 0; i < group.getChildCount(); i++) clearDecisions(group.getChildAt(i));
    }
  }

  // Everything else: react-native-webview's client, unchanged.

  @Override
  public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    return delegate.shouldOverrideUrlLoading(view, request);
  }

  @SuppressWarnings("deprecation")
  @Override
  public boolean shouldOverrideUrlLoading(WebView view, String url) {
    return delegate.shouldOverrideUrlLoading(view, url);
  }

  @Override
  public void onPageStarted(WebView view, String url, Bitmap favicon) {
    delegate.onPageStarted(view, url, favicon);
  }

  @Override
  public void onPageFinished(WebView view, String url) {
    delegate.onPageFinished(view, url);
  }

  @Override
  public void onPageCommitVisible(WebView view, String url) {
    delegate.onPageCommitVisible(view, url);
  }

  @Override
  public void onLoadResource(WebView view, String url) {
    delegate.onLoadResource(view, url);
  }

  @Override
  public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    return delegate.shouldInterceptRequest(view, request);
  }

  @Override
  public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
    delegate.doUpdateVisitedHistory(view, url, isReload);
  }

  @Override
  public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
    delegate.onReceivedError(view, request, error);
  }

  @SuppressWarnings("deprecation")
  @Override
  public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
    delegate.onReceivedError(view, errorCode, description, failingUrl);
  }

  @Override
  public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
    delegate.onReceivedHttpError(view, request, errorResponse);
  }

  @Override
  public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
    delegate.onReceivedHttpAuthRequest(view, handler, host, realm);
  }

  @Override
  public void onReceivedClientCertRequest(WebView view, ClientCertRequest request) {
    delegate.onReceivedClientCertRequest(view, request);
  }

  @Override
  public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
    return delegate.onRenderProcessGone(view, detail);
  }

  @Override
  public void onSafeBrowsingHit(WebView view, WebResourceRequest request, int threatType, SafeBrowsingResponse callback) {
    delegate.onSafeBrowsingHit(view, request, threatType, callback);
  }

  @Override
  public void onFormResubmission(WebView view, Message dontResend, Message resend) {
    delegate.onFormResubmission(view, dontResend, resend);
  }

  @Override
  public boolean shouldOverrideKeyEvent(WebView view, KeyEvent event) {
    return delegate.shouldOverrideKeyEvent(view, event);
  }

  @Override
  public void onUnhandledKeyEvent(WebView view, KeyEvent event) {
    delegate.onUnhandledKeyEvent(view, event);
  }

  @Override
  public void onScaleChanged(WebView view, float oldScale, float newScale) {
    delegate.onScaleChanged(view, oldScale, newScale);
  }

  @Override
  public void onReceivedLoginRequest(WebView view, String realm, String account, String args) {
    delegate.onReceivedLoginRequest(view, realm, account, args);
  }
}
