import { Document, Font, Image as PdfImage, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { PhrasingContent, Root, RootContent } from "mdast";
import type { ReactNode } from "react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

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

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 60, paddingHorizontal: 48, fontFamily: SANS, fontSize: 10.5, lineHeight: 1.5, color: "#1f2937" },
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
  image: { maxWidth: "100%", marginVertical: 4 },
  footer: { position: "absolute", bottom: 26, left: 48, right: 48, fontSize: 8, color: "#6b7280" },
});

interface Ctx {
  /** Riferimenti `[testo][id]` → URL. */
  defs: Map<string, string>;
  /** Dentro le liste gli spazi tra i blocchi sono ridotti. */
  tight: boolean;
}

const isSafeLink = (url: string) => /^(https?:|mailto:|tel:)/i.test(url);
const isLoadableImage = (url: string | undefined): url is string => !!url && /^(https?:|data:image\/)/i.test(url);

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
    const src = child.type === "image" ? child.url : child.type === "imageReference" ? ctx.defs.get(child.identifier) : undefined;
    if (isLoadableImage(src)) {
      flush();
      parts.push(<PdfImage key={parts.length} src={src} style={s.image} />);
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

export function markdownToPdf(markdown: string, title: string): Promise<Blob> {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const ctx: Ctx = { defs: definitionsOf(root), tight: false };
  return pdf(
    <Document title={title} creator="Musikademy" producer="Musikademy" language="it">
      <Page size="A4" style={s.page}>
        {blocks(root.children, ctx)}
        <Text style={s.footer} fixed>{title}</Text>
      </Page>
    </Document>,
  ).toBlob();
}
