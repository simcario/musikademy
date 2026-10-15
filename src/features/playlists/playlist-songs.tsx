"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, ListMusic, Music } from "lucide-react";
import { Marquee } from "@/components/shared/marquee";
import { Pill } from "@/components/shared/status-badge";
import { useGroups, useSongs } from "@/features/admin/hooks";
import { CATEGORY_ICON, MaterialRow } from "@/features/materials/material-card";
import { useMaterialsByIds, useSongsByIds } from "@/features/student-area/hooks";
import { NotesButton } from "@/features/playlists/song-notes";
import { cn } from "@/lib/utils";
import { songNotesOf } from "@/services/playlistService";
import type { Material, MaterialCategory, Playlist, PlaylistNote, Song, WithId } from "@/types";
import { CATEGORY_META } from "@/utils/status";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 brani · 3 gruppi · 2 studenti", per le card delle playlist. */
export function playlistSummary(p: Playlist, withSharing = false): string {
  const parts = [count(p.songIds?.length ?? 0, "brano", "brani")];
  if (withSharing) {
    if (p.groupIds?.length) parts.push(count(p.groupIds.length, "gruppo", "gruppi"));
    if (p.studentIds?.length) parts.push(count(p.studentIds.length, "studente", "studenti"));
    if (!p.audience?.length) parts.push("non condivisa");
  }
  return parts.join(" · ");
}

/** Copertina della playlist (o del brano) su sfondo colorato. */
export function PlaylistCover({ className = "size-12", song }: { className?: string; song?: boolean }) {
  const Icon = song ? Music : ListMusic;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-indigo-soft text-brand-ink ${className}`}>
      <Icon className="size-6" aria-hidden />
    </span>
  );
}

/** Destinatari di un materiale del brano: "Tutti" oppure i nomi dei gruppi. */
export function AudiencePills({ groupIds, groupNames }: { groupIds: string[]; groupNames: Map<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1 pl-1">
      {groupIds.length === 0 ? (
        <Pill tone="neutral">Tutti</Pill>
      ) : (
        groupIds.map((g) => (
          <Pill key={g} tone="secondary">
            {groupNames.get(g) ?? "Gruppo eliminato"}
          </Pill>
        ))
      )}
    </div>
  );
}

/** Un'icona per ogni categoria di materiale presente nel brano (ascolto, base, spartito…). */
function MaterialKinds({ materials }: { materials: WithId<Material>[] }) {
  const present = new Set(materials.map((m) => m.category));
  const kinds = (Object.keys(CATEGORY_META) as MaterialCategory[]).filter((c) => present.has(c));
  if (kinds.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {kinds.map((c) => {
        const Icon = CATEGORY_ICON[c];
        return (
          <span key={c} title={CATEGORY_META[c].label} className="flex size-6 items-center justify-center rounded-md bg-indigo-soft text-brand-ink">
            <Icon className="size-3.5" aria-hidden />
          </span>
        );
      })}
      <span className="sr-only">Materiali: {kinds.map((c) => CATEGORY_META[c].label).join(", ")}</span>
    </span>
  );
}

/**
 * Un brano in elenco. Con `onOpen` (docente) il clic apre il pannello laterale e la riga mostra le icone delle
 * categorie di materiali; senza (studente) la riga si espande e mostra i materiali.
 * Con `audienceIds` (studente: UID + gruppi) mostra solo i materiali per tutti e quelli dei suoi gruppi;
 * senza (docente) li mostra tutti, con i gruppi a cui sono destinati.
 */
export function SongBlock({
  song,
  index,
  materials,
  audienceIds,
  groupNames,
  actions,
  handle,
  footer,
  dragging,
  onOpen,
  notes = [],
}: {
  song: WithId<Song>;
  index?: number;
  materials: Map<string, WithId<Material>>;
  audienceIds?: string[];
  groupNames?: Map<string, string>;
  actions?: React.ReactNode;
  /** Maniglia di trascinamento (playlist del docente). */
  handle?: React.ReactNode;
  /** Riga di dettaglio sotto il titolo (es. "In playlist: …"). */
  footer?: React.ReactNode;
  dragging?: boolean;
  /** Apre il brano nel pannello laterale invece di espandere la riga. */
  onOpen?: () => void;
  /** Note del brano nella playlist (già filtrate per lo studente): icona in evidenza che le apre come post-it. */
  notes?: PlaylistNote[];
}) {
  const [open, setOpen] = useState(false);
  const items = (song.items ?? []).filter(
    (i) => !audienceIds || i.groupIds.length === 0 || i.groupIds.some((g) => audienceIds.includes(g)),
  );
  const shown = items.flatMap((i) => (materials.has(i.materialId) ? [{ item: i, material: materials.get(i.materialId)! }] : []));
  const panelId = `song-${song.id}`;
  const summary = [song.artist, count(items.length, "materiale", "materiali")].filter(Boolean).join(" · ");
  const expanded = !onOpen && open;

  return (
    <article className={cn("card-surface overflow-hidden", dragging && "shadow-dialog ring-2 ring-primary")}>
      <div className="flex items-center gap-1 pr-1">
        {handle}
        <button
          type="button"
          onClick={onOpen ?? (() => setOpen((o) => !o))}
          aria-expanded={onOpen ? undefined : open}
          aria-controls={onOpen ? undefined : panelId}
          className={cn("flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left hover:bg-muted/40", handle ? "pl-1" : "pl-4")}
        >
          {index !== undefined ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-mid text-sm font-bold tabular-nums">
              {index + 1}
            </span>
          ) : (
            <PlaylistCover className="size-9" song />
          )}
          <span className="min-w-0 flex-1">
            <Marquee className="font-semibold">{song.title}</Marquee>
            <span className="block truncate text-xs text-muted-foreground">{summary}</span>
            {footer && <span className="block truncate text-xs text-muted-foreground">{footer}</span>}
            {onOpen && <MaterialKinds materials={shown.map((s) => s.material)} />}
          </span>
          {!onOpen && (
            <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
          )}
        </button>
        {notes.length > 0 && (
          <span className={cn("flex shrink-0 items-center", actions ? "pl-1" : "px-2")}>
            <NotesButton notes={notes} songTitle={song.title} groupNames={groupNames} />
          </span>
        )}
        {actions}
      </div>
      {expanded && (
        <div id={panelId} className="space-y-3 border-t border-border px-4 py-3">
          {song.notes && <p className="text-sm whitespace-pre-line">{song.notes}</p>}
          {shown.length > 0 ? (
            <ul className="space-y-2">
              {shown.map(({ item, material }) => (
                <li key={material.id} className="space-y-1">
                  <MaterialRow material={material} />
                  {groupNames && <AudiencePills groupIds={item.groupIds} groupNames={groupNames} />}
                </li>
              ))}
            </ul>
          ) : (
            <Pill tone="neutral">Nessun materiale{audienceIds ? " per te" : ""}</Pill>
          )}
        </div>
      )}
    </article>
  );
}

/** Materiali di più brani, letti uno per uno (lo studente riceve solo quelli che le rules gli consentono). */
export function useSongMaterials(songs: WithId<Song>[]) {
  const ids = songs.flatMap((s) => s.materialIds ?? []);
  const q = useMaterialsByIds(ids);
  return { ...q, map: new Map((q.data ?? []).map((m) => [m.id, m])) };
}

/** Riga trascinabile: la maniglia avvia il trascinamento (mouse, dito o tastiera: spazio, frecce, spazio). */
function SortableSong(props: Omit<React.ComponentProps<typeof SongBlock>, "handle" | "dragging">) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.song.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <SongBlock
        {...props}
        dragging={isDragging}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Sposta ${props.song.title}`}
            title="Trascina per riordinare"
            className="flex h-16 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-5" aria-hidden />
          </button>
        }
      />
    </li>
  );
}

/**
 * Brani della playlist, nell'ordine scelto. Docente: tutti i materiali e le note con i gruppi e, con `onReorder`,
 * ordinamento a trascinamento; studente: i materiali e le note per tutti e del proprio gruppo.
 */
export function PlaylistSongs({
  playlist,
  audienceIds,
  songActions,
  onOpenSong,
  onReorder,
  emptyText = "Nessun brano in questa playlist.",
}: {
  playlist: WithId<Playlist>;
  /** Studente: UID + gruppi attivi. Assente = vista docente. */
  audienceIds?: string[];
  songActions?: (song: WithId<Song>, index: number) => React.ReactNode;
  /** Il clic su un brano lo apre nel pannello laterale invece di espanderlo. */
  onOpenSong?: (song: WithId<Song>) => void;
  /** Salva il nuovo ordine dei brani dopo un trascinamento; se fallisce torna l'ordine salvato. */
  onReorder?: (songIds: string[]) => Promise<unknown>;
  emptyText?: string;
}) {
  const staff = !audienceIds;
  const all = useSongs(staff);
  const mine = useSongsByIds(staff ? [] : (playlist.songIds ?? []));
  const source = staff ? all : mine;
  const byId = new Map((source.data ?? []).map((s) => [s.id, s]));
  // Ordine mostrato subito dopo il rilascio, finché la playlist salvata non lo conferma.
  const [pending, setPending] = useState<{ base: string[]; order: string[] } | null>(null);
  const saved = playlist.songIds ?? [];
  const order = pending && pending.base === saved ? pending.order : saved;
  const songs = order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const materials = useSongMaterials(songs);
  const groups = useGroups(staff);
  const groupNames = staff ? new Map((groups.data ?? []).map((g) => [g.id, g.name])) : undefined;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (source.isPending && saved.length) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (songs.length === 0) return <p className="card-surface p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;

  const common = (s: WithId<Song>, i: number) => ({
    song: s,
    index: i,
    materials: materials.map,
    audienceIds,
    groupNames,
    actions: songActions?.(s, i),
    onOpen: onOpenSong ? () => onOpenSong(s) : undefined,
    notes: songNotesOf(playlist, s.id, audienceIds),
  });

  if (!onReorder) {
    return (
      <ol className="space-y-2">
        {songs.map((s, i) => (
          <li key={s.id}>
            <SongBlock {...common(s, i)} />
          </li>
        ))}
      </ol>
    );
  }

  // Solo i brani esistenti: quelli eliminati nel frattempo escono dalla playlist al primo riordino.
  const ids = songs.map((s) => s.id);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setPending({ base: saved, order: next });
    onReorder!(next).catch(() => setPending(null));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Premi spazio per prendere il brano, usa le frecce per spostarlo e spazio per rilasciarlo; Esc annulla.",
        },
        announcements: {
          onDragStart: ({ active }) => `Hai preso ${byId.get(String(active.id))?.title ?? "il brano"}.`,
          onDragOver: ({ over }) => (over ? `Sopra la posizione ${ids.indexOf(String(over.id)) + 1}.` : ""),
          onDragEnd: ({ over }) => (over ? `Brano spostato in posizione ${ids.indexOf(String(over.id)) + 1}.` : "Brano rilasciato."),
          onDragCancel: () => "Spostamento annullato.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="space-y-2">
          {songs.map((s, i) => (
            <SortableSong key={s.id} {...common(s, i)} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}