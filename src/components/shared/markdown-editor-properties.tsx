"use client";

import { useState } from "react";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import { selectedRect } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension, useEditorState, type Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAssetImage } from "@/lib/files";
import { cn } from "@/lib/utils";
import { Field } from "./form";

type Align = "left" | "center" | "right";

type Selected =
  | { kind: "image"; pos: number; src: string; alt: string }
  | { kind: "table"; rows: number; cols: number; align: Align | null }
  | { kind: "rule" }
  | null;

/** L'elemento grafico su cui si sta lavorando: immagine o linea selezionata, oppure la tabella che contiene il cursore. */
function selectedOf(editor: Editor): Selected {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection) {
    const { node, from } = selection;
    if (node.type.name === "image") {
      const { src, alt } = node.attrs as { src?: string | null; alt?: string | null };
      return { kind: "image", pos: from, src: src ?? "", alt: alt ?? "" };
    }
    if (node.type.name === "horizontalRule") return { kind: "rule" };
  }
  if (editor.isActive("table")) {
    const { map, table, top, left } = selectedRect(editor.state);
    const cell = table.nodeAt(map.map[top * map.width + left]);
    return { kind: "table", rows: map.height, cols: map.width, align: (cell?.attrs.align as Align | null | undefined) ?? null };
  }
  return null;
}

/** Evidenzia la tabella che contiene il cursore, come si fa per un'immagine selezionata. */
export const ActiveTable = Extension.create({
  name: "activeTable",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: ({ doc, selection: { $from } }) => {
            for (let depth = $from.depth; depth > 0; depth--) {
              if ($from.node(depth).type.name !== "table") continue;
              return DecorationSet.create(doc, [Decoration.node($from.before(depth), $from.after(depth), { class: "is-selected" })]);
            }
            return null;
          },
        },
      }),
    ];
  },
});

/**
 * Campo che applica il valore all'uscita o con Invio: scrivendo non si crea un passo di «Annulla» a ogni tasto.
 * `onCommit` restituisce false se il valore non è accettabile: il campo torna a quello di prima.
 */
function DraftField({
  label,
  hint,
  value,
  onCommit,
  ...input
}: { label: string; hint?: string; value: string; onCommit: (value: string) => boolean } & Omit<React.ComponentProps<typeof Input>, "value">) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value && !onCommit(draft)) setDraft(value);
  };
  return (
    <Field label={label} hint={hint}>
      {(p) => (
        <Input
          {...p}
          {...input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Invio non deve salvare l'intero documento.
            e.preventDefault();
            commit();
          }}
          className="h-9 sm:h-9"
        />
      )}
    </Field>
  );
}

function ImageProperties({ editor, image }: { editor: Editor; image: Extract<Selected, { kind: "image" }> }) {
  const { pos, src, alt } = image;
  const dom = editor.view.nodeDOM(pos);
  const img = dom instanceof HTMLElement ? dom.querySelector("img") : null;

  // Per posizione e non per selezione: l'uscita dal campo può arrivare quando la selezione sta già cambiando.
  function update(attrs: { src: string } | { alt: string }) {
    return editor
      .chain()
      .command(({ tr, state }) => {
        const node = tr.doc.nodeAt(pos);
        if (node?.type.name !== "image") return false;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
        // Sostituire il nodo fa perdere la selezione: la rimetto, così il pannello resta aperto.
        if (state.selection instanceof NodeSelection && state.selection.from === pos) tr.setSelection(NodeSelection.create(tr.doc, pos));
        return true;
      })
      .run();
  }

  return (
    <>
      <DraftField
        key={`src:${pos}:${src}`}
        label="URL"
        hint={isAssetImage(src) ? "Immagine caricata nel documento." : undefined}
        value={src}
        onCommit={(text) => {
          const next = text.trim();
          if (!isAssetImage(next) && !/^(https?:\/\/|data:image\/)/i.test(next)) {
            toast.error("Inserisci un indirizzo che inizi con http:// o https://");
            return false;
          }
          return update({ src: next });
        }}
      />
      <DraftField
        key={`alt:${pos}:${alt}`}
        label="Testo alternativo"
        hint="Descrive l'immagine a chi non può vederla."
        value={alt}
        onCommit={(text) => update({ alt: text.trim() })}
      />
      {/* Solo lettura: il Markdown non permette di ridimensionare le immagini. */}
      {!!img?.naturalWidth && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Larghezza", img.naturalWidth],
            ["Altezza", img.naturalHeight],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-base font-semibold text-foreground">{value} px</dd>
            </div>
          ))}
        </dl>
      )}
      <Button type="button" variant="destructive" size="sm" onClick={() => editor.chain().focus().deleteSelection().run()}>
        <Trash2 aria-hidden /> Elimina immagine
      </Button>
    </>
  );
}

const ALIGNMENTS: [Align, string, typeof TextAlignStart][] = [
  ["left", "Allinea a sinistra", TextAlignStart],
  ["center", "Allinea al centro", TextAlignCenter],
  ["right", "Allinea a destra", TextAlignEnd],
];

function TableProperties({ editor, table }: { editor: Editor; table: Extract<Selected, { kind: "table" }> }) {
  // In Markdown l'allineamento vale per l'intera colonna.
  function alignColumn(align: Align | null) {
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const { map, tableStart, left, right } = selectedRect(state);
        for (let row = 0; row < map.height; row++) {
          for (let col = left; col < right; col++) {
            const pos = tableStart + map.map[row * map.width + col];
            const cell = tr.doc.nodeAt(pos);
            if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align });
          }
        }
        return true;
      })
      .run();
  }

  const action = (label: string, fn: (e: Editor) => void, disabled?: boolean) => (
    <Button
      key={label}
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      // Il clic non deve spostare il cursore fuori dalla tabella.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => fn(editor)}
    >
      {label}
    </Button>
  );

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {[
          ["Righe", table.rows],
          ["Colonne", table.cols],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">Riga</p>
        <div className="flex flex-wrap gap-2">
          {action("Aggiungi sopra", (e) => e.chain().focus().addRowBefore().run())}
          {action("Aggiungi sotto", (e) => e.chain().focus().addRowAfter().run())}
          {action("Elimina", (e) => e.chain().focus().deleteRow().run(), table.rows < 2)}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">Colonna</p>
        <div className="flex flex-wrap gap-2">
          {action("Aggiungi a sinistra", (e) => e.chain().focus().addColumnBefore().run())}
          {action("Aggiungi a destra", (e) => e.chain().focus().addColumnAfter().run())}
          {action("Elimina", (e) => e.chain().focus().deleteColumn().run(), table.cols < 2)}
        </div>
        <div className="flex gap-1 pt-1" role="group" aria-label="Allineamento della colonna">
          {ALIGNMENTS.map(([align, label, Icon]) => (
            <Button
              key={align}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              title={label}
              aria-pressed={table.align === align}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => alignColumn(table.align === align ? null : align)}
              className={cn(table.align === align && "bg-indigo-soft text-brand-ink")}
            >
              <Icon aria-hidden />
            </Button>
          ))}
        </div>
      </div>

      <Button type="button" variant="destructive" size="sm" onClick={() => editor.chain().focus().deleteTable().run()}>
        <Trash2 aria-hidden /> Elimina tabella
      </Button>
    </>
  );
}

const TITLES = { image: "Immagine", table: "Tabella", rule: "Linea di separazione" };

/**
 * Proprietà dell'elemento grafico selezionato nell'editor. Su schermi larghi è una colonna a destra,
 * altrimenti una barra in fondo che si apre a richiesta, per non coprire il testo mentre si scrive.
 */
export function PropertiesPanel({ editor }: { editor: Editor }) {
  const selected = useEditorState({ editor, selector: ({ editor: e }) => selectedOf(e) });
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      aria-label="Proprietà dell'elemento selezionato"
      className={cn(
        "shrink-0 border-border bg-popover lg:w-72 lg:overflow-y-auto lg:border-l",
        selected ? "sticky bottom-0 z-20 max-h-[50dvh] overflow-y-auto border-t lg:static lg:max-h-none lg:border-t-0" : "hidden lg:block",
      )}
    >
      <div className="flex items-center gap-2 px-4 py-2 lg:pt-4">
        <h3 className="section-label flex-1">{selected ? TITLES[selected.kind] : "Proprietà"}</h3>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-expanded={expanded}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded(!expanded)}
          >
            Proprietà {expanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
          </Button>
        )}
      </div>
      <div className={cn("space-y-4 px-4 pb-4", !expanded && "hidden lg:block")}>
        {!selected && (
          <p className="text-sm text-muted-foreground">Seleziona un&apos;immagine, una tabella o una linea per modificarne le proprietà.</p>
        )}
        {selected?.kind === "image" && <ImageProperties editor={editor} image={selected} />}
        {selected?.kind === "table" && <TableProperties editor={editor} table={selected} />}
        {selected?.kind === "rule" && (
          <Button type="button" variant="destructive" size="sm" onClick={() => editor.chain().focus().deleteSelection().run()}>
            <Trash2 aria-hidden /> Elimina linea
          </Button>
        )}
      </div>
    </aside>
  );
}
