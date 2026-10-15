"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { LoadMore } from "@/components/shared/states";
import { useActiveStudents, useGroups, useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { useMaterialsByIds } from "@/features/student-area/hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { newTrackId, playlistService } from "@/services/playlistService";
import { EXERCISE_CATEGORY, type Playlist, type PlaylistTrack, type WithId } from "@/types";
import { fullName } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void };

/** Nuova playlist, oppure modifica di titolo e descrizione. */
export function PlaylistDetailsDialog({
  open,
  onOpenChange,
  playlist,
  onCreated,
}: DialogProps & { playlist?: WithId<Playlist> | null; onCreated?: (id: string) => void }) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={playlist ? "Modifica playlist" : "Nuova playlist"}>
      <DetailsForm
        key={playlist?.id ?? "new"}
        playlist={playlist ?? null}
        onCreated={onCreated}
        onDone={() => onOpenChange(false)}
      />
    </SidePanel>
  );
}

function DetailsForm({
  playlist,
  onCreated,
  onDone,
}: {
  playlist: WithId<Playlist> | null;
  onCreated?: (id: string) => void;
  onDone: () => void;
}) {
  const { uid } = useSession();
  const [title, setTitle] = useState(playlist?.title ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [touched, setTouched] = useState(false);
  const trimmed = title.trim();
  const save = useStaffMutation(
    async () => {
      if (playlist) await playlistService.updateDetails(playlist.id, { title: trimmed, description });
      else onCreated?.(await playlistService.create({ title: trimmed, description }, uid));
    },
    { success: playlist ? "Playlist aggiornata" : "Playlist creata", invalidate: [["playlists"]], onSuccess: onDone },
  );

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
      <Field label="Titolo" required error={touched && !trimmed ? "Inserisci un titolo" : undefined}>
        {(p) => (
          <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Es. Saggio di Natale" autoFocus />
        )}
      </Field>
      <Field label="Descrizione">
        {(p) => <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />}
      </Field>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={playlist ? "Salva" : "Crea"} />
    </form>
  );
}

/** Condivisione: chi riceve la playlist vede tutti i brani e i loro materiali. */
export function PlaylistShareDialog({ open, onOpenChange, playlist }: DialogProps & { playlist: WithId<Playlist> | null }) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title="Condividi playlist" description={playlist?.title}>
      {playlist && <ShareForm key={playlist.id} playlist={playlist} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

function ShareForm({ playlist, onDone }: { playlist: WithId<Playlist>; onDone: () => void }) {
  const students = useActiveStudents();
  const groups = useGroups();
  const [studentIds, setStudentIds] = useState(playlist.studentIds ?? []);
  const [groupIds, setGroupIds] = useState(playlist.groupIds ?? []);
  const share = useStaffMutation(() => playlistService.share(playlist.id, { studentIds, groupIds }), {
    success: "Condivisione aggiornata",
    invalidate: [["playlists"], ["materials"]],
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        share.mutate(undefined);
      }}
    >
      <p className="text-sm text-muted-foreground">
        Chi scegli qui vede la playlist e tutti i materiali dei suoi brani, anche quelli che aggiungerai in seguito.
      </p>
      <CheckList
        label={`Gruppi (${groupIds.length} selezionati)`}
        items={(groups.data ?? []).map((g) => ({ id: g.id, label: g.name, sub: g.description }))}
        selected={groupIds}
        onChange={setGroupIds}
        emptyText={groups.isPending ? "Caricamento…" : "Nessun gruppo: creali in Organizzazione."}
        maxHeight="max-h-44"
      />
      <CheckList
        label={`Studenti (${studentIds.length} selezionati)`}
        items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
        selected={studentIds}
        onChange={setStudentIds}
        emptyText={students.isPending ? "Caricamento…" : "Nessuno studente attivo."}
        maxHeight="max-h-60"
      />
      <FormActions onCancel={onDone} submitting={share.isPending} submitLabel="Condividi" />
    </form>
  );
}

/** Nuovo brano in fondo alla playlist, oppure modifica di `track`: titolo, autore, note e materiali. */
export function TrackDialog({
  open,
  onOpenChange,
  playlist,
  track,
}: DialogProps & { playlist: WithId<Playlist>; track: PlaylistTrack | null }) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={track ? "Modifica brano" : "Nuovo brano"} description={playlist.title} wide>
      {open && <TrackForm key={track?.id ?? "new"} playlist={playlist} track={track} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

function TrackForm({ playlist, track, onDone }: { playlist: WithId<Playlist>; track: PlaylistTrack | null; onDone: () => void }) {
  const [title, setTitle] = useState(track?.title ?? "");
  const [artist, setArtist] = useState(track?.artist ?? "");
  const [notes, setNotes] = useState(track?.notes ?? "");
  const [materialIds, setMaterialIds] = useState<string[]>(track?.materialIds ?? []);
  const [touched, setTouched] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const page = useMaterialsPage({ search: debounced, sort: "title" });
  // I materiali già scelti restano in cima anche se la ricerca non li trova.
  const chosen = useMaterialsByIds(track?.materialIds ?? []);
  const trimmed = title.trim();

  const pageItems = page.data?.pages.flatMap((p) => p.items) ?? [];
  const known = new Map([...(chosen.data ?? []), ...pageItems].map((m) => [m.id, m]));
  const items = [
    ...materialIds.flatMap((id) => (known.has(id) ? [known.get(id)!] : [])),
    ...pageItems.filter((m) => !materialIds.includes(m.id) && m.category !== EXERCISE_CATEGORY),
  ];

  const save = useStaffMutation(
    () => {
      const next: PlaylistTrack = { id: track?.id ?? newTrackId(), title: trimmed, artist, notes, materialIds };
      const tracks = track ? playlist.tracks.map((t) => (t.id === track.id ? next : t)) : [...playlist.tracks, next];
      return playlistService.setTracks(playlist.id, tracks);
    },
    { success: track ? "Brano aggiornato" : "Brano aggiunto", invalidate: [["playlists"], ["materials"]], onSuccess: onDone },
  );

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
        <Field label="Titolo del brano" required error={touched && !trimmed ? "Inserisci il titolo" : undefined}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} autoFocus />}
        </Field>
        <Field label="Autore / interprete">
          {(p) => <Input {...p} value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={140} />}
        </Field>
      </div>
      <Field label="Note per lo studente">
        {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}
      </Field>
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca ascolti, basi, spartiti, testi, video…"
            aria-label="Cerca materiali"
            className="pl-9"
          />
        </div>
        <CheckList
          label={`Materiali del brano (${materialIds.length} selezionati)`}
          items={items.map((m) => ({ id: m.id, label: m.title, sub: CATEGORY_META[m.category].label }))}
          selected={materialIds}
          onChange={setMaterialIds}
          emptyText={page.isPending ? "Caricamento…" : debounced ? "Nessun risultato." : "Nessun materiale caricato."}
          maxHeight="max-h-80"
        />
        <LoadMore hasMore={!!page.hasNextPage} loading={page.isFetchingNextPage} onClick={() => page.fetchNextPage()} />
        <p className="text-xs text-muted-foreground">
          Chi riceve la playlist vede questi materiali anche se non gli sono assegnati in altro modo.
        </p>
      </div>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={track ? "Salva" : "Aggiungi brano"} />
    </form>
  );
}