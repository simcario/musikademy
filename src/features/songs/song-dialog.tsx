"use client";

import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { LoadMore } from "@/components/shared/states";
import { useGroups, useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { MaterialIcon } from "@/features/materials/material-card";
import { useMaterialsByIds } from "@/features/student-area/hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { songService } from "@/services/playlistService";
import { EXERCISE_CATEGORY, type Material, type Song, type SongItem, type WithId } from "@/types";
import { CATEGORY_META } from "@/utils/status";

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void };

/** Nuovo brano oppure modifica di `song`: dati e materiali, ognuno per tutti o per alcuni gruppi (ADR D29). */
export function SongDialog({ open, onOpenChange, song, onCreated }: DialogProps & { song: WithId<Song> | null; onCreated?: (id: string) => void }) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={song ? "Modifica brano" : "Nuovo brano"} description={song?.title} wide>
      {open && <SongForm key={song?.id ?? "new"} song={song} onCreated={onCreated} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

function SongForm({ song, onCreated, onDone }: { song: WithId<Song> | null; onCreated?: (id: string) => void; onDone: () => void }) {
  const { uid } = useSession();
  const groups = useGroups();
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [notes, setNotes] = useState(song?.notes ?? "");
  const [items, setItems] = useState<SongItem[]>(song?.items ?? []);
  const [touched, setTouched] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const page = useMaterialsPage({ search: debounced, sort: "title" });
  // I materiali già nel brano si leggono uno per uno: la pagina di ricerca potrebbe non contenerli.
  const chosen = useMaterialsByIds(song?.materialIds ?? []);
  const pageItems = page.data?.pages.flatMap((p) => p.items) ?? [];
  const known = new Map<string, WithId<Material>>([...(chosen.data ?? []), ...pageItems].map((m) => [m.id, m]));
  const selected = items.map((i) => i.materialId);
  const trimmed = title.trim();

  const save = useStaffMutation(
    async () => {
      const details = { title: trimmed, artist, notes };
      if (song) await songService.update(song.id, details, items);
      else onCreated?.(await songService.create(details, items, uid));
    },
    { success: song ? "Brano aggiornato" : "Brano creato", invalidate: [["songs"], ["materials"]], onSuccess: onDone },
  );

  const setGroups = (materialId: string, groupIds: string[]) =>
    setItems((xs) => xs.map((i) => (i.materialId === materialId ? { ...i, groupIds } : i)));

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (trimmed) save.mutate(undefined);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titolo" required error={touched && !trimmed ? "Inserisci il titolo" : undefined}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} autoFocus />}
        </Field>
        <Field label="Autore / interprete">
          {(p) => <Input {...p} value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={140} />}
        </Field>
      </div>
      <Field label="Note per chi lo studia">
        {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}
      </Field>

      <section className="space-y-2" aria-label="Materiali del brano">
        <h3 className="text-[13px] font-medium">Materiali del brano ({items.length})</h3>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-input p-3 text-sm text-muted-foreground">
            Nessun materiale: aggiungili dall&apos;elenco qui sotto.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => {
              const m = known.get(i.materialId);
              return (
                <li key={i.materialId} className="space-y-2 rounded-lg border border-input bg-card p-2.5">
                  <div className="flex items-center gap-3">
                    {m && <MaterialIcon type={m.type} className="size-9 rounded-lg" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m?.title ?? "Materiale non disponibile"}</p>
                      {m && <p className="truncate text-xs text-muted-foreground">{CATEGORY_META[m.category].label}</p>}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Togli ${m?.title ?? "materiale"} dal brano`}
                      onClick={() => setItems((xs) => xs.filter((x) => x.materialId !== i.materialId))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <GroupChips
                    groups={groups.data ?? []}
                    value={i.groupIds}
                    onChange={(ids) => setGroups(i.materialId, ids)}
                    label={`Per chi è ${m?.title ?? "il materiale"}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          &quot;Tutti&quot; = chi riceve una playlist con il brano. Scegliendo dei gruppi, il materiale lo vede solo chi ne fa
          parte (es. l&apos;ascolto della parte dei Soprani).
        </p>
      </section>

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca ascolti, basi, spartiti, testi, video…"
            aria-label="Cerca materiali da aggiungere"
            className="pl-9"
          />
        </div>
        <CheckList
          label="Aggiungi materiali"
          items={pageItems
            .filter((m) => m.category !== EXERCISE_CATEGORY)
            .map((m) => ({ id: m.id, label: m.title, sub: CATEGORY_META[m.category].label }))}
          selected={selected}
          onChange={(ids) =>
            setItems((xs) => [
              ...xs.filter((x) => ids.includes(x.materialId) || !pageItems.some((m) => m.id === x.materialId)),
              ...ids.filter((id) => !xs.some((x) => x.materialId === id)).map((id) => ({ materialId: id, groupIds: [] })),
            ])
          }
          emptyText={page.isPending ? "Caricamento…" : debounced ? "Nessun risultato." : "Nessun materiale caricato."}
          maxHeight="max-h-64"
        />
        <LoadMore hasMore={!!page.hasNextPage} loading={page.isFetchingNextPage} onClick={() => page.fetchNextPage()} />
      </div>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={song ? "Salva" : "Crea brano"} />
    </form>
  );
}

/** Selettore "Tutti / gruppi": nessun gruppo scelto = per tutti. */
export function GroupChips({
  groups,
  value,
  onChange,
  label,
}: {
  groups: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const chip = (active: boolean) =>
    cn(
      "flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
    );
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={value.length === 0} className={chip(value.length === 0)} onClick={() => onChange([])}>
        Tutti
      </button>
      {groups.map((g) => {
        const on = value.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            className={chip(on)}
            onClick={() => onChange(on ? value.filter((x) => x !== g.id) : [...value, g.id])}
          >
            {g.name}
          </button>
        );
      })}
    </div>
  );
}