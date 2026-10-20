"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PlaylistNote } from "@/types";

/** Leggera inclinazione alternata: i post-it sembrano attaccati a mano. */
const TILT = ["-rotate-1", "rotate-1", "-rotate-[0.5deg]", "rotate-[1.5deg]"];

/** Una nota come post-it giallo, con il nastro in alto e l'angolo piegato. Con `groupNames` mostra per chi è. */
export function PostIt({
  note,
  index = 0,
  groupNames,
}: {
  note: PlaylistNote;
  index?: number;
  groupNames?: Map<string, string>;
}) {
  return (
    <figure
      className={cn(
        "relative bg-yellow-100 px-4 pt-5 pb-4 text-yellow-950 shadow-[0_6px_14px_-6px_rgb(120_80_0/0.45)]",
        "[clip-path:polygon(0_0,100%_0,100%_calc(100%-18px),calc(100%-18px)_100%,0_100%)]",
        TILT[index % TILT.length],
      )}
    >
      <span className="absolute -top-1 left-1/2 h-4 w-16 -translate-x-1/2 rotate-2 bg-yellow-300/60" aria-hidden />
      <span className="absolute right-0 bottom-0 size-[18px] bg-linear-to-tl from-yellow-100 from-50% to-yellow-300 to-50%" aria-hidden />
      <p className="text-[15px] leading-relaxed whitespace-pre-line">{note.text}</p>
      {groupNames && (
        <figcaption className="mt-3 text-[11px] font-semibold tracking-wide text-yellow-800 uppercase">
          {note.groupIds.length === 0 ? "Per tutti" : note.groupIds.map((g) => groupNames.get(g) ?? "Gruppo eliminato").join(" · ")}
        </figcaption>
      )}
    </figure>
  );
}

export function PostIts({ notes, groupNames }: { notes: PlaylistNote[]; groupNames?: Map<string, string> }) {
  return (
    <div className="space-y-4 px-1 py-1">
      {notes.map((n, i) => (
        <PostIt key={n.id} note={n} index={i} groupNames={groupNames} />
      ))}
    </div>
  );
}

/**
 * Icona della riga del brano quando ci sono note: separata dalle icone dei materiali e in evidenza.
 * Il clic apre le note come post-it.
 */
export function NotesButton({
  notes,
  songTitle,
  groupNames,
}: {
  notes: PlaylistNote[];
  songTitle: string;
  groupNames?: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;
  const label = notes.length === 1 ? "1 nota" : `${notes.length} note`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label} per ${songTitle}`}
        title="Leggi le note"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-yellow-200 text-yellow-900 shadow-sm ring-1 ring-yellow-400/60 transition-transform hover:-rotate-6 hover:bg-yellow-300"
      >
        <StickyNote className="size-5" aria-hidden />
        {notes.length > 1 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-yellow-900 text-[10px] font-bold text-yellow-50 tabular-nums" aria-hidden>
            {notes.length}
          </span>
        )}
      </button>
      <PostItDialog open={open} onOpenChange={setOpen} notes={notes} songTitle={songTitle} groupNames={groupNames} />
    </>
  );
}

/** Le note sopra la pagina, come post-it: nessuna cornice di finestra. */
export function PostItDialog({
  open,
  onOpenChange,
  notes,
  songTitle,
  groupNames,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  notes: PlaylistNote[];
  songTitle: string;
  groupNames?: Map<string, string>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[85dvh] gap-3 overflow-y-auto bg-transparent p-3 ring-0 sm:max-w-sm"
        onClick={() => onOpenChange(false)}
      >
        <DialogTitle className="max-w-full justify-self-center truncate rounded-full bg-popover px-3 py-1 text-sm font-semibold shadow-sm">
          {songTitle}
        </DialogTitle>
        <DialogDescription className="sr-only">Note del docente per questo brano. Tocca per chiudere.</DialogDescription>
        <PostIts notes={notes} groupNames={groupNames} />
        <p className="justify-self-center rounded-full bg-popover px-3 py-1 text-xs text-muted-foreground shadow-sm" aria-hidden>
          Tocca per chiudere
        </p>
      </DialogContent>
    </Dialog>
  );
}
