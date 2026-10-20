/**
 * Video online (ADR D30): un materiale video può essere un link a YouTube, Vimeo o a un file video
 * pubblico invece di un file caricato. Qui si riconosce il servizio e si ricava l'URL da incorporare.
 */

export type VideoProvider = "youtube" | "vimeo" | "file" | "link";

export interface OnlineVideo {
  provider: VideoProvider;
  /** URL normalizzato, da aprire in una nuova scheda. */
  url: string;
  /** Player da incorporare in un iframe (YouTube, Vimeo). */
  embedUrl?: string;
}

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  file: "Video online",
  link: "Link esterno",
};

const YOUTUBE_ID = /^[\w-]{11}$/;

/** `1h2m3s`, `90s` o `90` → secondi. */
function seconds(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") return u.pathname.split("/")[1] ?? null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const [, kind, id] = u.pathname.split("/");
  return ["embed", "shorts", "live", "v"].includes(kind) ? (id ?? null) : null;
}

function vimeoEmbed(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  // vimeo.com/123, vimeo.com/123/abcdef (video non in elenco), player.vimeo.com/video/123?h=abcdef
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => /^\d+$/.test(p));
  if (i < 0) return null;
  const hash = u.searchParams.get("h") ?? (parts[i + 1] && /^[\da-f]+$/i.test(parts[i + 1]) ? parts[i + 1] : null);
  return `https://player.vimeo.com/video/${parts[i]}${hash ? `?h=${hash}` : ""}`;
}

/** Riconosce un link a un video; `null` se non è un URL http(s) valido. */
export function parseVideoUrl(input: string): OnlineVideo | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const url = u.toString();

  const yt = youtubeId(u);
  if (yt && YOUTUBE_ID.test(yt)) {
    const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
    // youtube-nocookie: nessun cookie di profilazione finché lo studente non avvia il video.
    const embedUrl = `https://www.youtube-nocookie.com/embed/${yt}?rel=0${start ? `&start=${start}` : ""}`;
    return { provider: "youtube", url, embedUrl };
  }
  const vimeo = vimeoEmbed(u);
  if (vimeo) return { provider: "vimeo", url, embedUrl: vimeo };
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { provider: "file", url };
  return { provider: "link", url };
}
