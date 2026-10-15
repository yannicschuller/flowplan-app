package app.flowplan.mobile;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.RestrictionsManager;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.appcompat.app.AlertDialog;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Locale;
import org.json.JSONObject;

/**
 * The shell around a Flowplan instance: remembers its address, keeps the window on it (links to
 * other sites open in the system browser), shows the offline page, takes text shared from other
 * apps and signs in with passkeys and SSO through the browser – the same hand-off as the desktop
 * app (lib/desktop-sign-in.ts on the server):
 *
 * <ol>
 *   <li>The instance's sign-in page links "Mit Passkey anmelden" / "Mit SSO anmelden" to
 *       /api/auth/desktop when it sees FlowplanMobile/ in the user agent. The app catches it.
 *   <li>It keeps a random verifier and opens /api/auth/desktop?challenge=&lt;its SHA-256&gt; in a
 *       Custom Tab (the browser, with passkeys and the password manager).
 *   <li>After signing in and confirming, the page opens flowplan://sign-in with a one-time code;
 *       the app redeems it with its verifier from the instance's page, so the session cookie
 *       lands in the app's web view.
 * </ol>
 *
 * <p>The JavaScript methods are only for the app's own pages (setup, offline); the instance's
 * pages do not reach the bridge at all (Capacitor only serves its own origin).
 */
@CapacitorPlugin(name = "FlowplanShell")
public class FlowplanShellPlugin extends Plugin {

    static final String SCHEME = "flowplan";
    private static final String PREFS = "flowplan";
    private static final String SERVER_KEY = "server";
    private static final String PENDING_PREFIX = "pending:";
    private static final long PENDING_LIFETIME_MS = 10 * 60_000;

    private String redeemWhenLoaded;
    private long signingInUntil;

    // ---- Address ----

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String server() {
        return prefs().getString(SERVER_KEY, null);
    }

    /** Managed installations (EMM app restrictions) suggest an address with the key "server". */
    private String suggestedServer() {
        RestrictionsManager manager = (RestrictionsManager) getContext().getSystemService(Context.RESTRICTIONS_SERVICE);
        if (manager == null) return "";
        Bundle restrictions = manager.getApplicationRestrictions();
        String value = restrictions != null ? restrictions.getString("server") : null;
        return value != null ? value : "";
    }

    static String origin(Uri url) {
        if (url == null || url.getScheme() == null || url.getHost() == null || url.getHost().isEmpty()) return null;
        String scheme = url.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("https") && !scheme.equals("http")) return null;
        String host = url.getHost().toLowerCase(Locale.ROOT);
        if (host.contains(":") && !host.startsWith("[")) host = "[" + host + "]";
        int port = url.getPort();
        int defaultPort = scheme.equals("https") ? 443 : 80;
        return port == -1 || port == defaultPort ? scheme + "://" + host : scheme + "://" + host + ":" + port;
    }

    private String localUrl(String page) {
        return getBridge().getScheme() + "://" + getBridge().getHost() + "/" + page;
    }

    private boolean isLocal(Uri url) {
        Uri local = Uri.parse(localUrl(""));
        return url != null && local.getScheme().equals(url.getScheme()) && local.getHost().equals(url.getHost());
    }

    private boolean fromOwnPage(PluginCall call) {
        String current = getBridge().getWebView().getUrl();
        if (current != null && isLocal(Uri.parse(current))) return true;
        call.reject("Only available on the app's own pages");
        return false;
    }

    // ---- JavaScript (own pages only) ----

    @PluginMethod
    public void getServer(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            if (!fromOwnPage(call)) return;
            JSObject result = new JSObject();
            String server = server();
            result.put("server", server != null ? server : "");
            result.put("suggested", suggestedServer());
            call.resolve(result);
        });
    }

    /** The page has checked the address (www/server.js); here it only has to be an origin. */
    @PluginMethod
    public void setServer(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            if (!fromOwnPage(call)) return;
            String value = call.getString("server", "");
            if (value == null || !value.equals(origin(Uri.parse(value)))) {
                call.reject("Invalid address");
                return;
            }
            SharedPreferences.Editor editor = prefs().edit().putString(SERVER_KEY, value);
            for (String key : prefs().getAll().keySet()) if (key.startsWith(PENDING_PREFIX)) editor.remove(key);
            editor.apply();
            call.resolve();
        });
    }

    @PluginMethod
    public void open(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            if (!fromOwnPage(call)) return;
            openServer();
            call.resolve();
        });
    }

    // ---- Window ----

    @Override
    public void load() {
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        // The instance shows the app's sign-in (passkeys and SSO in the browser) when it sees this.
        settings.setUserAgentString(settings.getUserAgentString() + " FlowplanMobile/" + BuildConfig.VERSION_NAME);
        getBridge().setWebViewClient(new ShellWebViewClient());
        // After Capacitor has started loading the start page: a link or shared text that opened
        // the app replaces it.
        webView.post(() -> handleIntent(getActivity().getIntent()));
    }

    void openServer() {
        String server = server();
        getBridge().getWebView().loadUrl(server != null ? server : localUrl("index.html"));
    }

    void showSetup() {
        getBridge().getWebView().loadUrl(localUrl("index.html?setup=1"));
    }

    /** Decides where a navigation in the window goes. True: the app took care of it. */
    boolean overrideLoad(Uri url, boolean mainFrame) {
        String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase(Locale.ROOT);
        if (isLocal(url)) return false;
        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) return false;
        boolean web = scheme.equals("http") || scheme.equals("https");
        String server = server();
        if (server != null && server.equals(origin(url))) {
            String path = url.getPath() == null ? "" : url.getPath();
            if (mainFrame && path.equals("/api/auth/desktop")) {
                startSignIn(url.getQueryParameter("via"));
                return true;
            }
            // Sign-in through the window (e-mail, older instances' SSO) may pass the identity
            // provider's pages.
            if (mainFrame) signingInUntil = path.startsWith("/api/auth/") ? System.currentTimeMillis() + 600_000 : 0;
            return false;
        }
        // Embedded content (videos, maps) stays in the page.
        if (!mainFrame) return !web;
        if (web && signingInUntil > System.currentTimeMillis()) return false;
        if (scheme.equals(SCHEME)) {
            handleLink(url);
            return true;
        }
        // Other sites, e-mail and phone links: the system.
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException ignored) {}
        return true;
    }

    // Capacitor asks plugins first; the web view client below asks with the frame as well.
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        return overrideLoad(url, true);
    }

    private class ShellWebViewClient extends BridgeWebViewClient {

        ShellWebViewClient() {
            super(getBridge());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return overrideLoad(request.getUrl(), request.isForMainFrame());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            String server = server();
            if (redeemWhenLoaded != null && server != null && server.equals(origin(Uri.parse(url)))) {
                String script = redeemWhenLoaded;
                redeemWhenLoaded = null;
                view.evaluateJavascript(script, null);
            }
        }

        /** Without a connection: the offline page. */
        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            String server = server();
            if (!request.isForMainFrame() || server == null || !server.equals(origin(request.getUrl()))) return;
            if (error.getErrorCode() == ERROR_UNSUPPORTED_SCHEME) return;
            view.loadUrl(
                localUrl("offline.html") +
                "?server=" +
                Uri.encode(server) +
                "&error=" +
                Uri.encode(String.valueOf(error.getDescription()))
            );
        }
    }

    // ---- Intents: sign-in codes, "Change server", shared text ----

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            handleLink(intent.getData());
        } else if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            share(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getStringExtra(Intent.EXTRA_TEXT));
        } else {
            return;
        }
        // Handled once, not again after a configuration change.
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
    }

    /** "Teilen" from other apps: the instance's share target (manifest share_target). */
    private void share(String subject, String text) {
        String server = server();
        if (server == null || (subject == null && text == null)) return;
        Uri.Builder target = Uri.parse(server).buildUpon().path("/share-target");
        String body = text == null ? "" : text.trim();
        if (subject != null && !subject.isEmpty()) target.appendQueryParameter("title", subject);
        if (body.matches("https?://\\S+")) target.appendQueryParameter("url", body);
        else if (!body.isEmpty()) target.appendQueryParameter("text", body);
        getBridge().getWebView().loadUrl(target.build().toString());
    }

    private void handleLink(Uri link) {
        if (!SCHEME.equals(link.getScheme())) return;
        String host = link.getHost() == null ? "" : link.getHost();
        if (host.equals("change-server")) {
            showSetup();
            return;
        }
        if (!host.equals("sign-in")) return;
        String server = server();
        String challenge = link.getQueryParameter("challenge");
        String code = link.getQueryParameter("code");
        String verifier = takePending(challenge);
        // Codes for another instance or a sign-in this app did not start are ignored: nobody can
        // sign the app in from outside.
        if (server == null || !server.equals(link.getQueryParameter("server")) || verifier == null || code == null || code.isEmpty()) {
            alert(R.string.sign_in_impossible, getContext().getString(R.string.sign_in_foreign));
            return;
        }
        redeem(code, verifier);
    }

    // ---- Sign-in through the browser ----

    private void startSignIn(String via) {
        String server = server();
        if (server == null) return;
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String verifier = base64Url(bytes);
        String challenge;
        try {
            challenge = base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException e) {
            return;
        }
        // Kept on disk: the system may end the app while the browser is open.
        SharedPreferences.Editor editor = prefs().edit();
        long now = System.currentTimeMillis();
        for (java.util.Map.Entry<String, ?> entry : prefs().getAll().entrySet()) {
            if (!entry.getKey().startsWith(PENDING_PREFIX)) continue;
            try {
                if (now - new JSONObject(String.valueOf(entry.getValue())).getLong("at") > PENDING_LIFETIME_MS) editor.remove(entry.getKey());
            } catch (Exception e) {
                editor.remove(entry.getKey());
            }
        }
        try {
            editor.putString(PENDING_PREFIX + challenge, new JSONObject().put("verifier", verifier).put("at", now).toString());
        } catch (Exception e) {
            return;
        }
        editor.apply();

        Uri.Builder url = Uri.parse(server).buildUpon().path("/api/auth/desktop").appendQueryParameter("challenge", challenge);
        if ("sso".equals(via)) url.appendQueryParameter("via", "sso");
        Uri target = url.build();
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(getActivity(), target);
        } catch (ActivityNotFoundException e) {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, target));
            } catch (ActivityNotFoundException ignored) {}
        }
    }

    private String takePending(String challenge) {
        if (challenge == null) return null;
        String stored = prefs().getString(PENDING_PREFIX + challenge, null);
        if (stored == null) return null;
        prefs().edit().remove(PENDING_PREFIX + challenge).apply();
        try {
            JSONObject pending = new JSONObject(stored);
            if (System.currentTimeMillis() - pending.getLong("at") > PENDING_LIFETIME_MS) return null;
            return pending.getString("verifier");
        } catch (Exception e) {
            return null;
        }
    }

    /** Redeemed from the instance's page, so the cookie lands in the web view. */
    private void redeem(String code, String verifier) {
        String body;
        try {
            body = new JSONObject().put("code", code).put("verifier", verifier).toString();
        } catch (Exception e) {
            return;
        }
        String failed = getContext().getString(R.string.sign_in_failed);
        String again = getContext().getString(R.string.sign_in_again);
        String script =
            "(async () => {" +
            "  const response = await fetch('/api/auth/desktop-redeem', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: " +
            JSONObject.quote(body) +
            "});" +
            "  if (response.ok) return location.replace('/');" +
            "  const answer = await response.json().catch(() => ({}));" +
            "  alert(" +
            JSONObject.quote(failed + "\n\n") +
            " + (answer.error || " +
            JSONObject.quote(again) +
            "));" +
            "})()";
        WebView webView = getBridge().getWebView();
        String server = server();
        if (server != null && webView.getUrl() != null && server.equals(origin(Uri.parse(webView.getUrl())))) {
            webView.evaluateJavascript(script, null);
        } else {
            redeemWhenLoaded = script;
            openServer();
        }
    }

    private void alert(int title, String message) {
        new AlertDialog.Builder(getActivity()).setTitle(title).setMessage(message).setPositiveButton(android.R.string.ok, null).show();
    }

    private static String base64Url(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }
}
