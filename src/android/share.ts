// "Share" from other apps on Android (modules/flowplan-android): text, links,
// photos and PDFs go to the compact capture screen (screens/ShareCapture.tsx),
// which saves them with the instance's capture.share action (Flowplan:
// lib/mobile-widget-actions.ts) into the inbox – the person's default capture
// database – or a page or database they choose. Instances from before
// capture.share get text and links through their web share target instead.
import type { SharedContent, SharedFile } from "../../modules/flowplan-android/src";
import { call, type Connection } from "../widgets/api";

export const MAX_SHARE_FILES = 10;
// What the instance keeps (photos, PDFs); other types are named as skipped.
export const shareable = (type: string) => /^image\//i.test(type) ? !/svg/i.test(type) : /^application\/pdf$/i.test(type);

export type ShareDraft = { title: string; text: string; url: string; files: SharedFile[]; skipped: string[] };

const URL_ONLY = /^https?:\/\/\S+$/i;

// What the screen starts with: the subject as title, a bare link as link,
// everything else as text (the instance finds a link in it as well).
export function shareDraft(content: SharedContent): ShareDraft {
  const text = content.text.trim();
  const files = content.files.filter((file) => shareable(file.type));
  const skipped = [...content.skipped, ...content.files.filter((file) => !shareable(file.type)).map((file) => file.name)];
  return {
    title: content.subject.trim().slice(0, 300),
    text: URL_ONLY.test(text) ? "" : text,
    url: URL_ONLY.test(text) ? text : "",
    files: files.slice(0, MAX_SHARE_FILES),
    skipped: [...skipped, ...files.slice(MAX_SHARE_FILES).map((file) => file.name)],
  };
}

export const hasContent = (draft: Pick<ShareDraft, "title" | "text" | "url" | "files">) =>
  !!(draft.title.trim() || draft.text.trim() || draft.url.trim() || draft.files.length);

// The fields of the request; files are added as repeated "file" parts.
export function shareFields(targetId: string, draft: Pick<ShareDraft, "title" | "text" | "url">): Record<string, string> {
  const fields: Record<string, string> = { action: "capture.share", targetId };
  if (draft.title.trim()) fields.title = draft.title.trim().slice(0, 300);
  if (draft.text.trim()) fields.text = draft.text.slice(0, 20_000);
  if (draft.url.trim()) fields.url = draft.url.trim().slice(0, 2000);
  return fields;
}

// The instance's web share target with text and link (older instances).
export function shareTargetPath(draft: Pick<ShareDraft, "title" | "text" | "url">) {
  const query = new URLSearchParams();
  if (draft.title.trim()) query.set("title", draft.title.trim());
  if (draft.url.trim()) query.set("url", draft.url.trim());
  if (draft.text.trim()) query.set("text", draft.text.trim());
  return `/share-target?${query}`;
}

// "1.2 MB" for the list of files.
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Fetcher = Parameters<typeof call>[3];
const defaultFetch: Fetcher = (url, init) => fetch(url, init);

// Saves the share: multipart with the files, JSON without.
export function saveShare(connection: Connection, targetId: string, draft: Pick<ShareDraft, "title" | "text" | "url" | "files">, fetcher: Fetcher = defaultFetch) {
  const fields = shareFields(targetId, draft);
  type Answer = { ok: true; action: string; url?: string; files?: string[] };
  if (!draft.files.length) return call<Answer>(connection, "/api/mobile/widgets/action", { method: "POST", body: JSON.stringify(fields) }, fetcher);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  // React Native's FormData takes { uri, name, type } for a file.
  for (const file of draft.files) form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  return call<Answer>(connection, "/api/mobile/widgets/action", { method: "POST", body: form }, fetcher);
}
