// Printing for the page (#424 in Flowplan): the web views ignore
// window.print() – Android's WebView never prints, the WKWebView only
// through the app – so the page hands its lean print copy to
// window.FlowplanApp.print (bridge-script.ts; lib/print-way.ts and
// components/print-page.ts in Flowplan): one HTML document with the
// instance's styles and its pictures inside. The app opens the system's print
// dialog with it (expo-print): a printer, or "Save as PDF".
//
// Pure apart from the printing itself (passed in), so the tests run it
// without the native module.
import { t } from "./i18n";

// The most one request carries – the same limit as APP_PRINT_MAX_CHARS in
// Flowplan (characters of the HTML, pictures included as data).
export const PRINT_MAX_CHARS = 25 * 1024 * 1024;

export type PrintRequest = { html: string; title: string; paper: "a4" | "letter" | null };
export type PrintCheck = { ok: true; request: PrintRequest } | { ok: false; reason: "invalid" | "tooLarge" };

// Checked again here, whatever the page's bridge sent: the HTML a string
// (a whole document, not empty) within the limit, the title a short line,
// the paper one of two.
export function printRequest(message: { html?: unknown; title?: unknown; paper?: unknown }): PrintCheck {
  const html = message.html;
  if (typeof html !== "string" || !html.trim()) return { ok: false, reason: "invalid" };
  if (html.length > PRINT_MAX_CHARS) return { ok: false, reason: "tooLarge" };
  const title = typeof message.title === "string" ? message.title.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 200) : "";
  const paper = message.paper === "a4" || message.paper === "letter" ? message.paper : null;
  return { ok: true, request: { html, title, paper } };
}

// The regions that use US Letter; everywhere else A4 (the page's
// "Standard" paper, which in a browser is the printer's).
const LETTER = new Set(["US", "CA", "MX", "PH", "PR", "CL", "CO", "VE", "CR", "GT", "PA", "DO", "SV", "NI", "BZ"]);
export function paperFor(paper: PrintRequest["paper"], region: string | null | undefined): "a4" | "letter" {
  if (paper) return paper;
  return LETTER.has(String(region || "").toUpperCase()) ? "letter" : "a4";
}
// In points (72 per inch), as expo-print takes them.
export const PAPER_POINTS = { a4: { width: 595, height: 842 }, letter: { width: 612, height: 792 } } as const;

// Android's printing (expo-print) lays the document out without margins:
// they come from @page. A margin first, so the document's own @page (the
// combined PDF's) wins; iOS takes them as an option instead.
export const PAGE_MARGIN_CSS = "@page{margin:14mm 12mm}";
export const IOS_MARGINS = { top: 40, right: 34, bottom: 40, left: 34 };
export function withPageMargin(html: string): string {
  const style = `<style data-app-print>${PAGE_MARGIN_CSS}</style>`;
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + style + html.slice(head.index + head[0].length);
  return style + html;
}

export type PrintOptions = { html: string; width: number; height: number; margins?: typeof IOS_MARGINS };
export function printOptions(request: PrintRequest, platform: string, region: string | null | undefined): PrintOptions {
  const size = PAPER_POINTS[paperFor(request.paper, region)];
  return platform === "ios"
    ? { html: request.html, ...size, margins: IOS_MARGINS }
    : { html: withPageMargin(request.html), ...size };
}

// iOS rejects printAsync when the person closes the dialog without printing
// (expo-print's PrintIncompleteException): no error then.
export function cancelledPrint(error: unknown): boolean {
  const { code, message } = (error || {}) as { code?: unknown; message?: unknown };
  return code === "ERR_PRINT_INCOMPLETE" || (typeof message === "string" && /did not complete/i.test(message));
}

// What the person is told when printing does not start.
export function printFailure(check: PrintCheck | "failed"): { title: string; message: string } | null {
  if (check !== "failed" && check.ok) return null;
  if (check !== "failed" && check.reason === "tooLarge") return { title: t("printFailed"), message: t("printTooLarge") };
  return { title: t("printFailed"), message: t("printFailedText") };
}

// Prints one request from the page: checks it, opens the system's print
// dialog, and tells the person (alert) what went wrong – a cancelled dialog
// is no error.
export async function printFromPage(
  message: { html?: unknown; title?: unknown; paper?: unknown },
  env: {
    platform: string;
    region: string | null | undefined;
    print: (options: PrintOptions) => Promise<void>;
    alert: (title: string, message: string) => void;
  },
): Promise<"printed" | "cancelled" | "refused" | "failed"> {
  const check = printRequest(message);
  if (!check.ok) {
    const failure = printFailure(check);
    if (failure) env.alert(failure.title, failure.message);
    return "refused";
  }
  try {
    await env.print(printOptions(check.request, env.platform, env.region));
    return "printed";
  } catch (error) {
    if (cancelledPrint(error)) return "cancelled";
    const failure = printFailure("failed")!;
    env.alert(failure.title, failure.message);
    return "failed";
  }
}
