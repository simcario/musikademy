"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown as MarkdownSyntax } from "@tiptap/markdown";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  CodeXml,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Redo2,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  TextQuote,
  Trash2,
  Undo2,
  Unlink,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/utils/errors";
import { useAssetImage } from "./markdown";

export interface MarkdownEditorApi {
  /** Markdown corrente, dalla vista attiva. */
  getMarkdown: () => string;
}

const AssetDirContext = createContext<string | undefined>(undefined);

/** Immagine nell'editor: risolve quelle su Storage e, se selezionata, mostra testo alternativo e rimozione. */
function ImageView({ node, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const assetDir = useContext(AssetDirContext);
  const { src, alt } = node.attrs as { src?: string | null; alt?: string | null };
  const url = useAssetImage(assetDir, src ?? undefined);
  return (
    <NodeViewWrapper as="span" className="relative inline-block max-w-full align-bottom">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL dinamico (Storage o sito esterno) */}
      <img src={url} alt={alt ?? ""} data-drag-handle className={cn(selected && "outline-2 outline-offset-2 outline-primary")} />
      {selected && (
        <span
          contentEditable={false}
          className="absolute top-full left-0 z-10 mt-2 flex w-72 max-w-[80vw] items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-dialog"
        >
          <Input
            value={alt ?? ""}
            onChange={(e) => updateAttributes({ alt: e.target.value })}
            // Invio non deve salvare l'intero documento.
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="Testo alternativo"
            aria-label="Testo alternativo dell'immagine"
            className="h-9 sm:h-9"
          />
          <Button type="button" variant="destructive" size="icon-sm" onClick={deleteNode} aria-label="Rimuovi immagine" title="Rimuovi immagine">
            <Trash2 aria-hidden />
          </Button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

const EditorImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

const imageFiles = (data: DataTransfer | null) => Array.from(data?.files ?? []).filter((f) => f.type.startsWith("image/"));
const withScheme = (url: string) => (/^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`);

function Tool({ label, active, className, ...props }: { label: string; active?: boolean } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // Il clic non deve togliere la selezione dal testo.
      onMouseDown={(e) => e.preventDefault()}
      className={cn(active && "bg-indigo-soft text-brand-ink", className)}
      {...props}
    />
  );
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />;

/**
 * Editor visuale (WYSIWYG) per Markdown, con vista «Codice» sul sorgente.
 * Non è controllato: parte da `value` e il testo si legge da `apiRef` al salvataggio.
 * Le immagini caricate finiscono in `assetDir` tramite `uploadImage`, che ne restituisce il nome.
 */
export default function MarkdownEditor({
  value,
  apiRef,
  onDirty,
  assetDir,
  uploadImage,
}: {
  value: string;
  apiRef: React.RefObject<MarkdownEditorApi | null>;
  onDirty: () => void;
  assetDir: string;
  uploadImage: (file: File) => Promise<string>;
}) {
  const [mode, setMode] = useState<"visual" | "source">("visual");
  const [source, setSource] = useState(value);
  const [panel, setPanel] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  // Quale vista ha modifiche non ancora riportate nell'altra: senza modifiche il testo originale resta intatto.
  const visualChanged = useRef(false);
  const sourceChanged = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const onFiles = useRef<(files: File[], pos?: number) => void>(() => undefined);

  const editor = useEditor({
    extensions: [
      // Il sottolineato non esiste in Markdown.
      StarterKit.configure({ underline: false, link: { openOnClick: false } }),
      EditorImage.configure({ inline: true, allowBase64: true }),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MarkdownSyntax,
    ],
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "markdown-body md-editor", "aria-label": "Contenuto del documento" },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        onFiles.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = moved ? [] : imageFiles(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        onFiles.current(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      },
    },
    onUpdate: ({ transaction }) => {
      if (!transaction.docChanged) return;
      visualChanged.current = true;
      onDirty();
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        codeBlock: e.isActive("codeBlock"),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        taskList: e.isActive("taskList"),
        blockquote: e.isActive("blockquote"),
        link: e.isActive("link"),
        table: e.isActive("table"),
        block: e.isActive("heading") ? `h${e.getAttributes("heading").level}` : "p",
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      },
  });

  function insertImage(src: string, alt: string, pos?: number) {
    if (mode === "source") {
      const at = textarea.current?.selectionStart;
      setSource((s) => `${s.slice(0, at ?? s.length)}![${alt.replace(/[[\]]/g, "")}](${src})${s.slice(at ?? s.length)}`);
      sourceChanged.current = true;
      onDirty();
    } else if (editor) {
      editor.chain().focus().insertContentAt(pos ?? editor.state.selection.from, { type: "image", attrs: { src, alt } }).run();
    }
  }

  async function insertFiles(files: File[], pos?: number) {
    for (const file of files) {
      const id = toast.loading(`Caricamento di ${file.name}…`);
      try {
        insertImage(await uploadImage(file), file.name.replace(/\.[^.]+$/, ""), pos);
        toast.success("Immagine inserita.", { id });
      } catch (e) {
        toast.error(errorMessage(e, "Impossibile caricare l'immagine."), { id });
      }
    }
  }

  useEffect(() => {
    onFiles.current = insertFiles;
    apiRef.current = {
      getMarkdown: () => {
        const text = mode === "visual" && visualChanged.current && editor ? editor.getMarkdown() : source;
        return `${text.trimEnd()}\n`;
      },
    };
  });

  function toggleMode() {
    if (!editor) return;
    if (mode === "visual") {
      if (visualChanged.current) setSource(`${editor.getMarkdown().trimEnd()}\n`);
      visualChanged.current = false;
      setMode("source");
    } else {
      if (sourceChanged.current) editor.commands.setContent(source, { contentType: "markdown", emitUpdate: false });
      sourceChanged.current = false;
      setMode("visual");
    }
    setPanel(null);
  }

  function openPanel(next: "link" | "image") {
    setUrl(next === "link" ? ((editor?.getAttributes("link").href as string | undefined) ?? "") : "");
    setPanel(panel === next ? null : next);
  }

  function applyUrl() {
    const target = url.trim();
    if (!editor || !target) return;
    if (panel === "image") {
      if (!/^https?:\/\//i.test(target)) return toast.error("Inserisci un indirizzo che inizi con http:// o https://");
      insertImage(target, "");
    } else {
      const href = withScheme(target);
      const chain = editor.chain().focus();
      if (editor.state.selection.empty && !editor.isActive("link")) {
        chain.insertContent({ type: "text", text: target, marks: [{ type: "link", attrs: { href } }] }).run();
      } else {
        chain.extendMarkRange("link").setLink({ href }).run();
      }
    }
    setPanel(null);
  }

  const visual = mode === "visual";
  const off = !editor || !visual;
  const run = (fn: (e: Editor) => void) => () => editor && fn(editor);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-popover">
        <div role="toolbar" aria-label="Formattazione" className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
          <Tool label="Annulla" disabled={off || !state?.canUndo} onClick={run((e) => e.chain().focus().undo().run())}>
            <Undo2 aria-hidden />
          </Tool>
          <Tool label="Ripeti" disabled={off || !state?.canRedo} onClick={run((e) => e.chain().focus().redo().run())}>
            <Redo2 aria-hidden />
          </Tool>
          <Divider />
          <NativeSelect
            aria-label="Stile del paragrafo"
            className="h-9 w-32 sm:h-9"
            disabled={off}
            value={state?.block ?? "p"}
            onChange={(ev) => {
              const v = ev.target.value;
              const chain = editor?.chain().focus();
              if (v === "p") chain?.setParagraph().run();
              else chain?.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">Testo</option>
            <option value="h1">Titolo 1</option>
            <option value="h2">Titolo 2</option>
            <option value="h3">Titolo 3</option>
            {state?.block && !["p", "h1", "h2", "h3"].includes(state.block) && <option value={state.block}>Titolo {state.block.slice(1)}</option>}
          </NativeSelect>
          <Divider />
          <Tool label="Grassetto" active={state?.bold} disabled={off} onClick={run((e) => e.chain().focus().toggleBold().run())}>
            <Bold aria-hidden />
          </Tool>
          <Tool label="Corsivo" active={state?.italic} disabled={off} onClick={run((e) => e.chain().focus().toggleItalic().run())}>
            <Italic aria-hidden />
          </Tool>
          <Tool label="Barrato" active={state?.strike} disabled={off} onClick={run((e) => e.chain().focus().toggleStrike().run())}>
            <Strikethrough aria-hidden />
          </Tool>
          <Tool label="Codice nel testo" active={state?.code} disabled={off} onClick={run((e) => e.chain().focus().toggleCode().run())}>
            <Code aria-hidden />
          </Tool>
          <Divider />
          <Tool label="Elenco puntato" active={state?.bulletList} disabled={off} onClick={run((e) => e.chain().focus().toggleBulletList().run())}>
            <List aria-hidden />
          </Tool>
          <Tool label="Elenco numerato" active={state?.orderedList} disabled={off} onClick={run((e) => e.chain().focus().toggleOrderedList().run())}>
            <ListOrdered aria-hidden />
          </Tool>
          <Tool label="Lista di controllo" active={state?.taskList} disabled={off} onClick={run((e) => e.chain().focus().toggleTaskList().run())}>
            <ListTodo aria-hidden />
          </Tool>
          <Divider />
          <Tool label="Citazione" active={state?.blockquote} disabled={off} onClick={run((e) => e.chain().focus().toggleBlockquote().run())}>
            <TextQuote aria-hidden />
          </Tool>
          <Tool label="Blocco di codice" active={state?.codeBlock} disabled={off} onClick={run((e) => e.chain().focus().toggleCodeBlock().run())}>
            <SquareCode aria-hidden />
          </Tool>
          <Tool label="Linea di separazione" disabled={off} onClick={run((e) => e.chain().focus().setHorizontalRule().run())}>
            <Minus aria-hidden />
          </Tool>
          <Divider />
          <Tool label="Collegamento" active={state?.link || panel === "link"} disabled={off} onClick={() => openPanel("link")}>
            <LinkIcon aria-hidden />
          </Tool>
          <Tool label="Immagine" active={panel === "image"} disabled={!editor} onClick={() => openPanel("image")}>
            <ImagePlus aria-hidden />
          </Tool>
          <Tool
            label="Tabella"
            active={state?.table}
            disabled={off || state?.table}
            onClick={run((e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          >
            <TableIcon aria-hidden />
          </Tool>
          <Button
            type="button"
            variant={visual ? "outline" : "default"}
            size="sm"
            className="ml-auto"
            aria-pressed={!visual}
            title={visual ? "Mostra il codice Markdown" : "Torna alla vista visuale"}
            disabled={!editor}
            onClick={toggleMode}
          >
            <CodeXml aria-hidden /> Codice
          </Button>
        </div>

        {visual && state?.table && (
          <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5">
            <span className="section-label mr-1">Tabella</span>
            {(
              [
                ["Aggiungi riga", (e) => e.chain().focus().addRowAfter().run()],
                ["Aggiungi colonna", (e) => e.chain().focus().addColumnAfter().run()],
                ["Elimina riga", (e) => e.chain().focus().deleteRow().run()],
                ["Elimina colonna", (e) => e.chain().focus().deleteColumn().run()],
                ["Elimina tabella", (e) => e.chain().focus().deleteTable().run()],
              ] as [string, (e: Editor) => void][]
            ).map(([label, fn]) => (
              <Button key={label} type="button" variant="ghost" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={run(fn)}>
                {label}
              </Button>
            ))}
          </div>
        )}

        {panel && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-2 py-1.5">
            {panel === "image" && (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
                  <Upload aria-hidden /> Carica dal dispositivo
                </Button>
                <span className="text-xs text-muted-foreground">oppure</span>
              </>
            )}
            <Input
              autoFocus={panel === "link"}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Invio non deve salvare l'intero documento.
                e.preventDefault();
                applyUrl();
              }}
              placeholder={panel === "link" ? "https://esempio.it" : "Indirizzo web dell'immagine"}
              aria-label={panel === "link" ? "Indirizzo del collegamento" : "Indirizzo web dell'immagine"}
              className="h-9 min-w-40 flex-1 sm:h-9"
            />
            <Button type="button" size="sm" disabled={!url.trim()} onClick={applyUrl}>
              {panel === "link" ? "Applica" : "Inserisci"}
            </Button>
            {panel === "link" && state?.link && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                  setPanel(null);
                }}
              >
                <Unlink aria-hidden /> Rimuovi
              </Button>
            )}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            setPanel(null);
            if (files.length) void insertFiles(files);
          }}
        />
      </div>

      <div className="pb-safe min-h-0 flex-1 lg:overflow-y-auto">
        <article className="mx-auto w-full max-w-3xl bg-card px-5 py-8 sm:my-6 sm:rounded-xl sm:px-10 sm:shadow-card">
          <AssetDirContext.Provider value={assetDir}>
            <EditorContent editor={editor} className={cn(!visual && "hidden")} />
          </AssetDirContext.Provider>
          {!visual && (
            <textarea
              ref={textarea}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                sourceChanged.current = true;
                onDirty();
              }}
              spellCheck={false}
              aria-label="Codice Markdown del documento"
              className="field-sizing-content block min-h-[60vh] w-full resize-y bg-transparent font-mono text-sm leading-relaxed outline-none"
            />
          )}
        </article>
      </div>
    </div>
  );
}
