import { Document, Font, Image as PdfImage, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { PhrasingContent, Root, RootContent } from "mdast";
import type { ReactNode } from "react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { authService } from "@/services/authService";

/**
 * Markdown → PDF con testo vero (selezionabile), generato nel browser.
 * Modulo pesante: va importato solo con `import()` al momento dell'uso (vedi saveMarkdownAsPdf).
 */

// DejaVu copre accenti, frecce, caselle di spunta e simboli musicali (♭ ♯ ♪), assenti nei font PDF standard.
const SANS = "DejaVu Sans";
const MONO = "DejaVu Sans Mono";
Font.register({
  family: SANS,
  fonts: [
    { src: "/fonts/DejaVuSans.ttf" },
    { src: "/fonts/DejaVuSans-Bold.ttf", fontWeight: "bold" },
    { src: "/fonts/DejaVuSans-Oblique.ttf", fontStyle: "italic" },
    { src: "/fonts/DejaVuSans-BoldOblique.ttf", fontWeight: "bold", fontStyle: "italic" },
  ],
});
// Un solo file per tutte le varianti: il codice dentro grassetti/corsivi non deve far fallire la risoluzione del font.
Font.register({
  family: MONO,
  fonts: [
    { src: "/fonts/DejaVuSansMono.ttf" },
    { src: "/fonts/DejaVuSansMono.ttf", fontWeight: "bold" },
    { src: "/fonts/DejaVuSansMono.ttf", fontStyle: "italic" },
    { src: "/fonts/DejaVuSansMono.ttf", fontWeight: "bold", fontStyle: "italic" },
  ],
});
// La sillabazione predefinita è quella inglese: meglio nessuna.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111827";
const BORDER = "#d1d5db";
const SURFACE = "#f3f4f6";
const HEADING_SIZE = [20, 16, 13.5, 12, 11, 10.5];
const PAGE_PADDING = 48;
const CONTENT_WIDTH = 595.28 - PAGE_PADDING * 2; // A4 in punti
const MAX_IMAGE_HEIGHT = 600;
/** Oltre questo lato l'immagine viene ridotta: una foto a piena risoluzione gonfierebbe il PDF. */
const MAX_IMAGE_PIXELS = 2000;
const PT_PER_PX = 0.75;

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 60, paddingHorizontal: PAGE_PADDING, fontFamily: SANS, fontSize: 10.5, lineHeight: 1.5, color: "#1f2937" },
  block: { marginBottom: 8 },
  tightBlock: { marginBottom: 3 },
  heading: { fontWeight: "bold", color: INK, lineHeight: 1.25, marginTop: 10, marginBottom: 6 },
  strong: { fontWeight: "bold", color: INK },
  emphasis: { fontStyle: "italic" },
  strike: { textDecoration: "line-through" },
  link: { color: "#4f46e5", textDecoration: "underline" },
  inlineCode: { fontFamily: MONO, fontSize: 9.5, backgroundColor: SURFACE },
  pre: { backgroundColor: SURFACE, borderRadius: 4, padding: 8 },
  code: { fontFamily: MONO, fontSize: 9, lineHeight: 1.4 },
  quote: { borderLeftWidth: 3, borderLeftColor: "#a5b4fc", paddingLeft: 10, fontStyle: "italic" },
  rule: { borderBottomWidth: 1, borderBottomColor: BORDER, marginVertical: 10 },
  listItem: { flexDirection: "row" },
  marker: { width: 14 },
  markerWide: { width: 22 },
  listBody: { flex: 1 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: BORDER },
  tr: { flexDirection: "row" },
  td: { flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER, paddingVertical: 3, paddingHorizontal: 5 },
  th: { backgroundColor: SURFACE, fontWeight: "bold", color: INK },
  image: { maxWidth: "100%", objectFit: "contain", marginVertical: 4 },
  footer: { position: "absolute", bottom: 26, left: PAGE_PADDING, right: PAGE_PADDING, fontSize: 8, color: "#6b7280" },
});

/** Immagine già scaricata e pronta per il PDF (dimensioni in punti). */
interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

interface Ctx {
  /** Riferimenti `[testo][id]` → URL. */
  defs: Map<string, string>;
  /** Immagini caricate, per URL: quelle mancanti (irraggiungibili, formato ignoto) ripiegano sul testo alternativo. */
  images: Map<string, LoadedImage>;
  /** Dentro le liste gli spazi tra i blocchi sono ridotti. */
  tight: boolean;
}

const isSafeLink = (url: string) => /^(https?:|mailto:|tel:)/i.test(url);
const isLoadableImage = (url: string | undefined): url is string => !!url && /^(https?:|data:image\/)/i.test(url);

function imageUrlOf(node: PhrasingContent, defs: Map<string, string>): string | undefined {
  // Un'immagine cliccabile `[![alt](img)](link)` vale come l'immagine che contiene.
  if ((node.type === "link" || node.type === "linkReference") && node.children.length === 1) return imageUrlOf(node.children[0], defs);
  const url = node.type === "image" ? node.url : node.type === "imageReference" ? defs.get(node.identifier) : undefined;
  return isLoadableImage(url) ? url : undefined;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Scarica un'immagine e la prepara per il PDF. Quelle esterne passano da /api/image-proxy (il browser
 * non può leggerne i byte senza CORS); il PDF accetta solo PNG e JPEG, gli altri formati vengono convertiti.
 */
async function loadImage(url: string, token: () => Promise<string>): Promise<LoadedImage> {
  const res = url.startsWith("data:")
    ? await fetch(url)
    : await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!res.ok) throw new Error("Immagine non disponibile.");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) throw new Error("Immagine senza dimensioni.");
    const shrink = Math.min(1, MAX_IMAGE_PIXELS / Math.max(w, h));
    let src: string;
    if (shrink === 1 && (blob.type === "image/png" || blob.type === "image/jpeg")) {
      src = await readAsDataUrl(blob);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * shrink);
      canvas.height = Math.round(h * shrink);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      src = blob.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
    }
    // Grandezza naturale, ridotta se non entra nella pagina.
    const fit = Math.min(1, CONTENT_WIDTH / (w * PT_PER_PX), MAX_IMAGE_HEIGHT / (h * PT_PER_PX));
    return { src, width: w * PT_PER_PX * fit, height: h * PT_PER_PX * fit };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadImages(root: Root, defs: Map<string, string>): Promise<Map<string, LoadedImage>> {
  const urls = new Set<string>();
  const visit = (nodes: RootContent[]) => {
    for (const n of nodes) {
      if (n.type === "paragraph") for (const c of n.children) urls.add(imageUrlOf(c, defs) ?? "");
      else if ("children" in n) visit(n.children as RootContent[]);
    }
  };
  visit(root.children);
  urls.delete("");

  let tokenPromise: Promise<string> | undefined;
  const token = () => (tokenPromise ??= authService.idToken());
  const images = new Map<string, LoadedImage>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        images.set(url, await loadImage(url, token));
      } catch {
        // Resta il testo alternativo.
      }
    }),
  );
  return images;
}

function inline(nodes: PhrasingContent[], ctx: Ctx): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        // Gli a capo semplici del sorgente sono spazi, non interruzioni di riga.
        return n.value.replace(/\n/g, " ");
      case "strong":
        return <Text key={i} style={s.strong}>{inline(n.children, ctx)}</Text>;
      case "emphasis":
        return <Text key={i} style={s.emphasis}>{inline(n.children, ctx)}</Text>;
      case "delete":
        return <Text key={i} style={s.strike}>{inline(n.children, ctx)}</Text>;
      case "inlineCode":
        return <Text key={i} style={s.inlineCode}>{n.value}</Text>;
      case "break":
        return "\n";
      case "link":
      case "linkReference": {
        const url = n.type === "link" ? n.url : ctx.defs.get(n.identifier);
        const children = inline(n.children, ctx);
        return url && isSafeLink(url) ? (
          <Link key={i} src={url} style={s.link}>{children}</Link>
        ) : (
          <Text key={i}>{children}</Text>
        );
      }
      case "image":
      case "imageReference":
        return n.alt ?? "";
      case "footnoteReference":
        return `[${n.label ?? n.identifier}]`;
      case "html":
        return n.value;
      default:
        return null;
    }
  });
}

/** Un paragrafo può contenere immagini, che in PDF non possono stare dentro una riga di testo: le separo. */
function paragraph(children: PhrasingContent[], ctx: Ctx): ReactNode[] {
  const parts: ReactNode[] = [];
  let run: PhrasingContent[] = [];
  const flush = () => {
    if (run.some((r) => r.type !== "text" || r.value.trim())) parts.push(<Text key={parts.length}>{inline(run, ctx)}</Text>);
    run = [];
  };
  for (const child of children) {
    const image = ctx.images.get(imageUrlOf(child, ctx.defs) ?? "");
    if (image) {
      flush();
      parts.push(<PdfImage key={parts.length} src={image.src} style={[s.image, { width: image.width, height: image.height }]} />);
    } else {
      run.push(child);
    }
  }
  flush();
  return parts;
}

function blocks(nodes: RootContent[], ctx: Ctx): ReactNode[] {
  const spacing = ctx.tight ? s.tightBlock : s.block;
  return nodes.map((n, i) => {
    switch (n.type) {
      case "paragraph":
        return <View key={i} style={spacing}>{paragraph(n.children, ctx)}</View>;
      case "heading":
        return (
          <Text key={i} style={[s.heading, { fontSize: HEADING_SIZE[n.depth - 1] }]} minPresenceAhead={40}>
            {inline(n.children, ctx)}
          </Text>
        );
      case "list": {
        const start = n.start ?? 1;
        return (
          <View key={i} style={spacing}>
            {n.children.map((item, j) => {
              const marker = item.checked === true ? "☑" : item.checked === false ? "☐" : n.ordered ? `${start + j}.` : "•";
              return (
                <View key={j} style={s.listItem}>
                  <Text style={n.ordered ? s.markerWide : s.marker}>{marker}</Text>
                  <View style={s.listBody}>{blocks(item.children, { ...ctx, tight: true })}</View>
                </View>
              );
            })}
          </View>
        );
      }
      case "blockquote":
        return <View key={i} style={[spacing, s.quote]}>{blocks(n.children, ctx)}</View>;
      case "code":
        return (
          <View key={i} style={[spacing, s.pre]}>
            {/* Spazi non separabili: l'indentazione a inizio riga altrimenti andrebbe persa. */}
            <Text style={s.code}>{n.value.replace(/\t/g, "  ").replace(/^ +/gm, (m) => " ".repeat(m.length))}</Text>
          </View>
        );
      case "table":
        return (
          <View key={i} style={[spacing, s.table]}>
            {n.children.map((row, r) => (
              <View key={r} style={s.tr} wrap={false}>
                {row.children.map((cell, c) => (
                  <View key={c} style={r === 0 ? [s.td, s.th] : s.td}>
                    <Text style={{ textAlign: n.align?.[c] ?? "left" }}>{inline(cell.children, ctx)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      case "thematicBreak":
        return <View key={i} style={s.rule} />;
      case "footnoteDefinition":
        return (
          <View key={i} style={[spacing, s.listItem]}>
            <Text style={s.markerWide}>[{n.label ?? n.identifier}]</Text>
            <View style={s.listBody}>{blocks(n.children, { ...ctx, tight: true })}</View>
          </View>
        );
      case "html":
        return <Text key={i} style={spacing}>{n.value}</Text>;
      default:
        return null;
    }
  });
}

function definitionsOf(root: Root): Map<string, string> {
  const defs = new Map<string, string>();
  const visit = (nodes: RootContent[]) => {
    for (const n of nodes) {
      if (n.type === "definition") defs.set(n.identifier, n.url);
      else if ("children" in n) visit(n.children as RootContent[]);
    }
  };
  visit(root.children);
  return defs;
}

export async function markdownToPdf(markdown: string, title: string): Promise<Blob> {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const defs = definitionsOf(root);
  const ctx: Ctx = { defs, images: await loadImages(root, defs), tight: false };
  return pdf(
    <Document title={title} creator="Musikademy" producer="Musikademy" language="it">
      <Page size="A4" style={s.page}>
        {blocks(root.children, ctx)}
        <Text style={s.footer} fixed>{title}</Text>
      </Page>
    </Document>,
  ).toBlob();
}
