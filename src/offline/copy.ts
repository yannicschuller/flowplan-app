// The stored page of a profile's copy, ready for the web view (Shell.tsx),
// or null when there is none that can work.
import { offlineDocument, utf8 } from "./document";
import { DATA_CACHE } from "./policy";
import type { OfflineCopy } from "./store";

const header = (headers: [string, string][], name: string) => headers.find(([key]) => key.toLowerCase() === name)?.[1] ?? null;

export async function copyDocument(copy: OfflineCopy): Promise<string | null> {
  const state = await copy.state();
  if (!state.page) return null;
  const page = await copy.match(DATA_CACHE, "/");
  if (!page) return null;
  const built = await offlineDocument(utf8(page.body), header(page.headers, "content-security-policy"), async (path) => {
    const entry = await copy.match(null, path);
    return entry ? { body: entry.body, type: header(entry.headers, "content-type") || "" } : null;
  });
  return built?.html ?? null;
}
