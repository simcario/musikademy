import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "@/lib/video";

describe("parseVideoUrl (ADR D30)", () => {
  it("riconosce i link YouTube e ne ricava il player", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      const v = parseVideoUrl(url);
      expect(v?.provider).toBe("youtube");
      expect(v?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    }
  });

  it("mantiene il punto di partenza di YouTube", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=1m30s")?.embedUrl).toContain("start=90");
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")?.embedUrl).toContain("start=42");
  });

  it("riconosce Vimeo, anche i video non in elenco", () => {
    expect(parseVideoUrl("https://vimeo.com/76979871")?.embedUrl).toBe("https://player.vimeo.com/video/76979871");
    expect(parseVideoUrl("https://vimeo.com/76979871/abc123def")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=abc123def",
    );
    expect(parseVideoUrl("https://player.vimeo.com/video/76979871?h=ff00")?.provider).toBe("vimeo");
  });

  it("distingue file video e link generici", () => {
    expect(parseVideoUrl("https://example.com/video/lezione.mp4")?.provider).toBe("file");
    expect(parseVideoUrl("https://example.com/pagina")?.provider).toBe("link");
  });

  it("rifiuta testo e protocolli non web", () => {
    expect(parseVideoUrl("non è un link")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl("ftp://example.com/a.mp4")).toBeNull();
  });
});
