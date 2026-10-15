package app.flowplan.mobile;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.util.HashMap;
import java.util.Map;

/**
 * Paints the status bar and navigation bar areas (the window around the page, see SystemBars'
 * insets) in the colours the page has at its top and bottom edge, sampled from the rendered page –
 * so header and footer run into the system bars like in a native app – and keeps the bars' icons
 * readable. The page tells when it may look different (navigation, scrolling, dialogs, theme);
 * pages that scroll as a whole keep their colours while content passes the edges.
 */
class SystemBarColors {

    /** Reports changes from the page, at most a few times a second. */
    static final String SCRIPT =
        "(() => {" +
        "  if (window.top !== window || window.__flowplanEdges || !window.FlowplanEdges) return;" +
        "  window.__flowplanEdges = true;" +
        "  let timer = 0;" +
        "  const opaque = (el) => { const c = el && getComputedStyle(el).backgroundColor; return c && c !== 'transparent' && !c.replace(/ /g, '').endsWith(',0)') ? c : ''; };" +
        "  const report = () => { const p = document.scrollingElement || document.documentElement;" +
        "    FlowplanEdges.changed(JSON.stringify({ scrolls: p.scrollHeight > innerHeight + 2, atTop: p.scrollTop <= 1," +
        "      atBottom: p.scrollTop + innerHeight >= p.scrollHeight - 2, background: opaque(document.body) || opaque(document.documentElement) })); };" +
        "  const changed = () => { if (timer) return; timer = setTimeout(() => { timer = 0; report(); }, 120); };" +
        "  for (const type of ['scroll', 'resize', 'hashchange', 'popstate', 'transitionend', 'animationend', 'click', 'touchend', 'keyup'])" +
        "    addEventListener(type, changed, { capture: true, passive: true });" +
        "  new MutationObserver(changed).observe(document.documentElement, { attributes: true });" +
        "  if (document.body) new MutationObserver(changed).observe(document.body, { attributes: true, childList: true });" +
        "  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', changed);" +
        "  changed();" +
        "})();";

    private final Activity activity;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final EdgesDrawable background = new EdgesDrawable();
    private boolean scheduled;
    // What the page reported: does it scroll as a whole, and where is it.
    private volatile boolean pageScrolls;
    private volatile boolean pageAtTop = true;
    private volatile boolean pageAtBottom = true;
    private volatile Integer pageBackground;
    private boolean bottomSettled;

    SystemBarColors(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        int fallback = ContextCompat.getColor(activity, R.color.flowplan_background);
        background.top = fallback;
        background.bottom = fallback;
        webView.setBackgroundColor(fallback);
        activity.getWindow().getDecorView().setBackground(background);
        webView.addJavascriptInterface(this, "FlowplanEdges");
        webView.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> sample());
    }

    /** Called by the page script (on the JavaScript bridge thread). */
    @JavascriptInterface
    public void changed(String state) {
        try {
            org.json.JSONObject json = new org.json.JSONObject(state);
            pageScrolls = json.optBoolean("scrolls");
            pageAtTop = json.optBoolean("atTop", true);
            pageAtBottom = json.optBoolean("atBottom", true);
            pageBackground = cssColor(json.optString("background"));
        } catch (Exception ignored) {}
        sample();
    }

    /** "rgb(r, g, b)" from getComputedStyle; null when (partly) transparent. */
    private static Integer cssColor(String css) {
        String[] parts = css.replaceAll("[^0-9.,]", "").split(",");
        if (parts.length < 3) return null;
        try {
            if (parts.length >= 4 && Double.parseDouble(parts[3]) < 0.99) return null;
            return Color.rgb(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), Integer.parseInt(parts[2]));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    void pageFinished(WebView view) {
        bottomSettled = false;
        view.evaluateJavascript(SCRIPT, null);
        main.postDelayed(this::sample, 300);
    }

    void sample() {
        if (scheduled) return;
        scheduled = true;
        // After the next frame: the page has drawn its change.
        main.postDelayed(
            () -> {
                scheduled = false;
                if (webView.getWidth() < 2 || webView.getHeight() < 4) return;
                int fallback = ContextCompat.getColor(activity, R.color.flowplan_background);
                Integer sampledTop = rowColor(1);
                Integer sampledBottom = rowColor(webView.getHeight() - 3);
                int top = sampledTop != null ? sampledTop : fallback;
                int bottom = sampledBottom != null ? sampledBottom : fallback;
                // Pages that scroll as a whole keep their colours while scrolling: each from the
                // page resting at that end (the bottom one from the page's background until then).
                if (pageScrolls) {
                    if (!pageAtTop) top = background.top;
                    if (!pageAtBottom) bottom = bottomSettled ? background.bottom : (pageBackground != null ? pageBackground : bottom);
                    else bottomSettled = true;
                }
                apply(top, bottom);
            },
            32
        );
    }

    /** The colour most of a row of the page has (icons and text on a bar do not count). */
    private Integer rowColor(int y) {
        int width = 64;
        Bitmap row = Bitmap.createBitmap(width, 1, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(row);
        canvas.scale(width / (float) webView.getWidth(), 1f);
        canvas.translate(-webView.getScrollX(), -(y + webView.getScrollY()));
        webView.draw(canvas);
        Map<Integer, int[]> buckets = new HashMap<>();
        int[] best = null;
        for (int x = 0; x < width; x++) {
            int pixel = row.getPixel(x, 0);
            if (Color.alpha(pixel) < 200) continue;
            int key = ((Color.red(pixel) >> 3) << 10) | ((Color.green(pixel) >> 3) << 5) | (Color.blue(pixel) >> 3);
            int[] bucket = buckets.get(key);
            if (bucket == null) buckets.put(key, bucket = new int[4]);
            bucket[0]++;
            bucket[1] += Color.red(pixel);
            bucket[2] += Color.green(pixel);
            bucket[3] += Color.blue(pixel);
            if (best == null || bucket[0] > best[0]) best = bucket;
        }
        row.recycle();
        if (best == null) return null;
        return Color.rgb(best[1] / best[0], best[2] / best[0], best[3] / best[0]);
    }

    private void apply(int top, int bottom) {
        if (background.top != top || background.bottom != bottom) {
            background.top = top;
            background.bottom = bottom;
            background.invalidateSelf();
        }
        View decor = activity.getWindow().getDecorView();
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(activity.getWindow(), decor);
        bars.setAppearanceLightStatusBars(!isDark(top));
        bars.setAppearanceLightNavigationBars(!isDark(bottom));
    }

    private static boolean isDark(int color) {
        return 0.2126 * Color.red(color) + 0.7152 * Color.green(color) + 0.0722 * Color.blue(color) < 128;
    }

    /** Upper half in the top colour, lower half in the bottom colour. */
    private static class EdgesDrawable extends Drawable {

        int top;
        int bottom;
        private final Paint paint = new Paint();

        @Override
        public void draw(Canvas canvas) {
            Rect bounds = getBounds();
            int middle = bounds.centerY();
            paint.setColor(top);
            canvas.drawRect(bounds.left, bounds.top, bounds.right, middle, paint);
            paint.setColor(bottom);
            canvas.drawRect(bounds.left, middle, bounds.right, bounds.bottom, paint);
        }

        @Override
        public void setAlpha(int alpha) {}

        @Override
        public void setColorFilter(ColorFilter colorFilter) {}

        @Override
        public int getOpacity() {
            return PixelFormat.OPAQUE;
        }
    }
}
