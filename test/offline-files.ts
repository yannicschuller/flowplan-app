// FlowplanOfflineFiles.swift in Node, for the tests and the browser check
// (scripts/offline-e2e.ts): the same path rules over a folder.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OfflineFiles } from "../src/offline/store";

const COMPONENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/;
export function checkPath(path: string, allowRoot = false) {
  if (path === "" && allowRoot) return;
  const parts = path.split("/");
  if (!parts.length || parts.length > 4 || parts.some((part) => !COMPONENT.test(part))) throw new Error("invalidPath");
}

export function nodeFiles(root: string, available = 10 * 1024 ** 3): OfflineFiles & { writes: string[] } {
  const at = (path: string, allowRoot = false) => {
    checkPath(path, allowRoot);
    return join(root, path);
  };
  const writes: string[] = [];
  return {
    writes,
    read: async (path) => readFile(at(path)).then((b) => b.toString("base64"), () => null),
    write: async (path, base64) => {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("invalidData");
      await mkdir(dirname(at(path)), { recursive: true });
      await writeFile(at(path), Buffer.from(base64, "base64"));
      writes.push(path);
    },
    readText: async (path) => readFile(at(path), "utf8").catch(() => null),
    writeText: async (path, text) => {
      await mkdir(dirname(at(path)), { recursive: true });
      await writeFile(at(path), text);
      writes.push(path);
    },
    remove: async (path) => rm(at(path), { recursive: true, force: true }),
    list: async (path) => readdir(at(path, true)).then((names) => names.filter((n) => COMPONENT.test(n)), () => []),
    available: async () => available,
  };
}
export const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
