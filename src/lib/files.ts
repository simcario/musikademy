import type { MaterialType } from "@/types";

const MB = 1024 * 1024;

interface FileRule {
  type: MaterialType;
  extensions: string[];
  mimes: string[];
  maxSize: number;
}

/** Deve restare allineato con storage.rules. */
export const FILE_RULES: FileRule[] = [
  { type: "pdf", extensions: ["pdf"], mimes: ["application/pdf"], maxSize: 50 * MB },
  {
    type: "audio",
    extensions: ["mp3", "wav", "m4a"],
    mimes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"],
    maxSize: 100 * MB,
  },
  { type: "video", extensions: ["mp4", "mov"], mimes: ["video/mp4", "video/quicktime"], maxSize: 500 * MB },
  {
    type: "image",
    extensions: ["jpg", "jpeg", "png", "webp"],
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxSize: 20 * MB,
  },
];

const DEFAULT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const ACCEPT_ATTR = FILE_RULES.flatMap((r) => r.extensions.map((e) => `.${e}`)).join(",");

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export type FileCheck = { ok: true; type: MaterialType; contentType: string } | { ok: false; error: string };

export function checkFile(file: Pick<File, "name" | "size" | "type">): FileCheck {
  const ext = extensionOf(file.name);
  const rule = FILE_RULES.find((r) => r.extensions.includes(ext));
  if (!rule) {
    return { ok: false, error: "Formato non supportato. Usa PDF, MP3, WAV, M4A, MP4, MOV, JPG, PNG o WEBP." };
  }
  if (file.size > rule.maxSize) {
    return { ok: false, error: `File troppo grande: massimo ${rule.maxSize / MB} MB per questo formato.` };
  }
  if (file.size === 0) return { ok: false, error: "Il file è vuoto." };
  // Alcuni browser non valorizzano il MIME (es. .m4a): lo ricaviamo dall'estensione.
  const contentType = rule.mimes.includes(file.type) ? file.type : DEFAULT_MIME[ext];
  return { ok: true, type: rule.type, contentType };
}

export const AVATAR_MAX_SIZE = 5 * MB;

export function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const base = name
    .slice(0, name.length - (ext ? ext.length + 1 : 0))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}
