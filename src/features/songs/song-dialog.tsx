"use client";

import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { LoadMore } from "@/components/shared/states";
import { WizardActions, WizardProgress } from "@/components/shared/wizard";
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

/**
 * Nuovo brano (wizard: dati → materiali → gruppi) oppure modifica di `song` su una sola pagina.
 * Ogni materiale vale per tutti o per alcuni gruppi (ADR D29).
 */
export function SongDialog({ open, onOpenChange, song, onCreated }: DialogProps & { song: WithId<Song> | null; onCreated?: (id: string) => void }) {
  const onDone = () => onOpenChange(false);
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={song ? "Modifica brano" : "Nuovo brano"} description={song?.title} wide>
      {open &&
        (song ? (
          <SongEditForm key={song.id} song={song} onDone={onDone} />
        ) : (
          <SongWizard key="new" onCreated={onCreated} onDone={onDone} />
        ))}
    </SidePanel>
  );
}

/** Stato condiviso da wizard e modifica: dati, materiali scelti con i loro gruppi, ricerca e salvataggio. */
function useSongDraft(song: WithId<Song> | null, onDone: () => void, onCreated?: (id: string) => void) {
  const { uid } = useSession();
  const groups = useGroups();
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [notes, setNotes] = useState(song?.notes ?? "");
  const [items, setItems] = useState<SongItem[]>(song?.items ?? []);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const page = useMaterialsPage({ search: debounced, sort: "title" });
  // I materiali già nel brano si leggono uno per uno: la pagina di ricerca potrebbe non contenerli.
  const chosen = useMaterialsByIds(song?.materialIds ?? []);
  // Quelli spuntati si ricordano: cambiando ricerca escono dalla pagina, ma servono ancora (titolo, passo dei gruppi).
  const [picked, setPicked] = useState<Map<string, WithId<Material>>>(new Map());
  const pageItems = page.data?.pages.flatMap((p) => p.items) ?? [];
  const known = new Map<string, WithId<Material>>([...(chosen.data ?? []), ...picked.values(), ...pageItems].map((m) => [m.id, m]));
  const trimmed = title.trim();

  const save = useStaffMutation(
    async () => {
      const details = { title: trimmed, artist, notes };
      if (song) await songService.update(song.id, details, items);
      else {
        // Prima si crea, poi si avvisa: con `onCreated?.(await …)` la creazione salterebbe se `onCreated` manca.
        const id = await songService.create(details, items, uid);
        onCreated?.(id);
      }
    },
    { success: song ? "Brano aggiornato" : "Brano creato", invalidate: [["songs"], ["materials"]], onSuccess: onDone },
  );

  /** Spunte della pagina di ricerca: i materiali fuori dalla pagina restano come sono. */
  const pick = (ids: string[]) => {
    setPicked((m) => new Map([...m, ...pageItems.filter((x) => ids.includes(x.id)).map((x) => [x.id, x] as const)]));
    setItems((xs) => [
      ...xs.filter((x) => ids.includes(x.materialId) || !pageItems.some((m) => m.id === x.materialId)),
      ...ids.filter((id) => !xs.some((x) => x.materialId === id)).map((id) => ({ materialId: id, groupIds: [] })),
    ]);
  };
  const unpick = (materialId: string) => setItems((xs) => xs.filter((x) => x.materialId !== materialId));
  const setGroups = (materialId: string, groupIds: string[]) =>
    setItems((xs) => xs.map((i) => (i.materialId === materialId ? { ...i, groupIds } : i)));

  return {
    groups: groups.data ?? [],
    title,
    setTitle,
    artist,
    setArtist,
    notes,
    setNotes,
    trimmed,
    items,
    known,
    search,
    setSearch,
    debounced,
    page,
    pageItems,
    pick,
    unpick,
    setGroups,
    save,
  };
}

type Draft = ReturnType<typeof useSongDraft>;

const WIZARD_STEPS = ["Dati del brano", "Materiali", "Gruppi"];

function SongWizard({ onCreated, onDone }: { onCreated?: (id: string) => void; onDone: () => void }) {
  const d = useSongDraft(null, onDone, onCreated);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const last = index === WIZARD_STEPS.length - 1;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (index === 0) {
          setTouched(true);
          if (!d.trimmed) return;
        }
        if (last) d.save.mutate(undefined);
        else setIndex(index + 1);
      }}
    >
      <WizardProgress steps={WIZARD_STEPS} index={index} />

      <div className="min-h-48 space-y-4">
        {index === 0 && <SongDetails d={d} touched={touched} />}
        {index === 1 && (
          <>
            <MaterialPicker d={d} />
            <section className="space-y-2" aria-label="Materiali scelti">
              <h3 className="text-[13px] font-medium">Scelti ({d.items.length})</h3>
              <SongItems d={d} emptyText="Nessun materiale scelto: puoi aggiungerli anche dopo, modificando il brano." />
            </section>
          </>
        )}
        {index === 2 && (
          <section className="space-y-2" aria-label="Gruppi dei materiali">
            <GroupsHint />
            <SongItems d={d} withGroups emptyText="Nessun materiale scelto: il brano sarà creato vuoto, potrai aggiungerli dopo." />
          </section>
        )}
      </div>

      <WizardActions
        index={index}
        last={last}
        submitting={d.save.isPending}
        submitLabel="Crea brano"
        onBack={() => setIndex(index - 1)}
        onCancel={onDone}
      />
    </form>
  );
}

function SongEditForm({ song, onDone }: { song: WithId<Song>; onDone: () => void }) {
  const d = useSongDraft(song, onDone);
  const [touched, setTouched] = useState(false);

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (d.trimmed) d.save.mutate(undefined);
      }}
    >
      <SongDetails d={d} touched={touched} />
      <section className="space-y-2" aria-label="Materiali del brano">
        <h3 className="text-[13px] font-medium">Materiali del brano ({d.items.length})</h3>
        <SongItems d={d} withGroups emptyText="Nessun materiale: aggiungili dall'elenco qui sotto." />
        <GroupsHint />
      </section>
      <MaterialPicker d={d} />
      <FormActions onCancel={onDone} submitting={d.save.isPending} submitLabel="Salva" />
    </form>
  );
}

function SongDetails({ d, touched }: { d: Draft; touched: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titolo" required error={touched && !d.trimmed ? "Inserisci il titolo" : undefined}>
          {(p) => <Input {...p} value={d.title} onChange={(e) => d.setTitle(e.target.value)} maxLength={140} autoFocus />}
        </Field>
        <Field label="Autore / interprete">
          {(p) => <Input {...p} value={d.artist} onChange={(e) => d.setArtist(e.target.value)} maxLength={140} />}
        </Field>
      </div>
      <Field label="Note per chi lo studia">
        {(p) => <Textarea {...p} rows={2} value={d.notes} onChange={(e) => d.setNotes(e.target.value)} maxLength={2000} />}
      </Field>
    </>
  );
}

function MaterialPicker({ d }: { d: Draft }) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={d.search}
          onChange={(e) => d.setSearch(e.target.value)}
          // Invio nella ricerca non deve inviare il form (salvare o passare al passo dopo).
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="Cerca ascolti, basi, spartiti, testi, video…"
          aria-label="Cerca materiali da aggiungere"
          className="pl-9"
        />
      </div>
      <CheckList
        label="Aggiungi materiali"
        items={d.pageItems
          .filter((m) => m.category !== EXERCISE_CATEGORY)
          .map((m) => ({ id: m.id, label: m.title, sub: CATEGORY_META[m.category].label }))}
        selected={d.items.map((i) => i.materialId)}
        onChange={d.pick}
        emptyText={d.page.isPending ? "Caricamento…" : d.debounced ? "Nessun risultato." : "Nessun materiale caricato."}
        maxHeight="max-h-64"
      />
      <LoadMore hasMore={!!d.page.hasNextPage} loading={d.page.isFetchingNextPage} onClick={() => d.page.fetchNextPage()} />
    </div>
  );
}

/** Materiali scelti; con `withGroups` ognuno ha il selettore "Tutti / gruppi". */
function SongItems({ d, withGroups, emptyText }: { d: Draft; withGroups?: boolean; emptyText: string }) {
  if (d.items.length === 0) {
    return <p className="rounded-lg border border-dashed border-input p-3 text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {d.items.map((i) => {
        const m = d.known.get(i.materialId);
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
                onClick={() => d.unpick(i.materialId)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            {withGroups && (
              <GroupChips
                groups={d.groups}
                value={i.groupIds}
                onChange={(ids) => d.setGroups(i.materialId, ids)}
                label={`Per chi è ${m?.title ?? "il materiale"}`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GroupsHint() {
  return (
    <p className="text-xs text-muted-foreground">
      &quot;Tutti&quot; = chi riceve una playlist con il brano. Scegliendo dei gruppi, il materiale lo vede solo chi ne fa
      parte (es. l&apos;ascolto della parte dei Soprani).
    </p>
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
