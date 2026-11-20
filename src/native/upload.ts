// The native uploader of src/upload.ts on Android: expo-file-system's
// File.upload (multipart, OkHttp) – the file is read from disk by the native
// side, and a failure arrives as its exception (code and message) instead of
// React Native's bare "Network request failed" (yannicschuller/flowplan#403).
//
// Only Android: iOS keeps React Native's fetch and FormData as before (the
// reports are from Android; expo-file-system's iOS upload runs in a
// background URLSession by default, which behaves differently from the
// app's other requests). Not for an instance with a pinned certificate
// (src/certs/pins.ts): expo-file-system builds its own OkHttp client, without
// React Native's CustomClientBuilder (CertificatePins.kt), so it would refuse
// that certificate – there the old path stays.
import { Platform } from "react-native";
import { Directory, File, Paths, UploadType } from "expo-file-system";
import { normalizeHost } from "../certs/pins";
import { store } from "../store";
import type { NativeUploader } from "../upload";

const FOLDER = "flowplan-upload";

// A name that can be a file name on its own.
const safeName = (name: string) => name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_").replace(/^\.+/, "").trim().slice(0, 120);

const basename = (file: File) => {
  try {
    return decodeURIComponent(file.name);
  } catch {
    return file.name;
  }
};

// Android sends the file under its own name on disk, which is not always the
// name the instance should keep (a share's copy is "0-Invoice.pdf", a voice
// memo the recorder's name): then a copy with the right name, in a folder of
// its own, removed afterwards.
const upload: NativeUploader = async ({ url, file, fields, headers, signal }) => {
  const source = new File(file.uri);
  const name = safeName(file.name);
  let folder: Directory | null = null;
  let sent = source;
  if (name && basename(source) !== name) {
    folder = new Directory(Paths.cache, FOLDER, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    folder.create({ intermediates: true, idempotent: true });
    sent = new File(folder, name);
    source.copySync(sent);
  }
  try {
    const answer = await sent.upload(url, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType: file.type || "application/octet-stream",
      parameters: fields,
      headers,
      signal,
    });
    return { status: answer.status, body: answer.body };
  } finally {
    if (folder)
      try {
        folder.delete();
      } catch {}
  }
};

export function nativeUploader(server: string): NativeUploader | null {
  if (Platform.OS !== "android") return null;
  let host = "";
  try {
    host = normalizeHost(new URL(server).hostname);
  } catch {}
  if (host && store.certificatePins().some((pin) => pin.host === host)) return null;
  return upload;
}
