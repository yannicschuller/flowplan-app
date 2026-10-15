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
 * readable. The page tells when it may look different (navigation, scrolling, dialogs, theme).
 */
class SystemBarColors {

    /** Reports changes from the page, at most a few times a second. */
    static final String SCRIPT =
        "(() => {" +
        "  if (window.top !== window || window.__flowplanEdges || !window.FlowplanEdges) return;" +
        "  window.__flowplanEdges = true;" +
        "  let timer = 0;" +
        "  const changed = () => { if (timer) return; timer = setTimeout(() => { timer = 0; FlowplanEdges.changed(); }, 150); };" +
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
    public void changed() {
        sample();
    }

    void pageFinished(WebView view) {
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
                Integer top = rowColor(1);
                Integer bottom = rowColor(webView.getHeight() - 3);
                apply(top != null ? top : fallback, bottom != null ? bottom : fallback);
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
