"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useGroups, useSongs, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { SongDialog } from "@/features/songs/song-dialog";
import { playlistService } from "@/services/playlistService";
import type { Playlist, WithId } from "@/types";
import { fullName } from "@/utils/format";
import { searchToken } from "@/utils/keywords";

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
      else {
        // Prima si crea, poi si avvisa: con `onCreated?.(await …)` la creazione salterebbe se `onCreated` manca.
        const id = await playlistService.create({ title: trimmed, description }, uid);
        onCreated?.(id);
      }
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

/** Condivisione: chi riceve la playlist vede i brani e, di ognuno, i materiali per tutti o per il proprio gruppo. */
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
    invalidate: [["playlists"], ["songs"], ["materials"]],
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
        Chi scegli qui vede la playlist e i suoi brani. Di ogni brano vede i materiali per tutti e quelli destinati ai gruppi
        di cui fa parte.
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
        label={`Utenti (${studentIds.length} selezionati)`}
        items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
        selected={studentIds}
        onChange={setStudentIds}
        emptyText={students.isPending ? "Caricamento…" : "Nessun utente attivo."}
        maxHeight="max-h-60"
      />
      <FormActions onCancel={onDone} submitting={share.isPending} submitLabel="Condividi" />
    </form>
  );
}

/** Aggiunge brani in fondo alla playlist (o ne crea uno nuovo al volo). */
export function AddSongsDialog({ open, onOpenChange, playlist }: DialogProps & { playlist: WithId<Playlist> }) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title="Aggiungi brani" description={playlist.title}>
      {open && <AddSongsForm playlist={playlist} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

function AddSongsForm({ playlist, onDone }: { playlist: WithId<Playlist>; onDone: () => void }) {
  const songs = useSongs();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const token = search ? searchToken(search) : null;
  const available = (songs.data ?? []).filter(
    (s) => !(playlist.songIds ?? []).includes(s.id) && (!token || s.keywords?.includes(token)),
  );
  const add = useStaffMutation(() => playlistService.setSongs(playlist.id, [...(playlist.songIds ?? []), ...selected]), {
    success: selected.length === 1 ? "Brano aggiunto" : "Brani aggiunti",
    invalidate: [["playlists"], ["songs"], ["materials"]],
    onSuccess: onDone,
  });

  return (
    <>
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length) add.mutate(undefined);
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca brano" aria-label="Cerca brano" className="pl-9" />
        </div>
        <Button type="button" variant="outline" onClick={() => setCreating(true)}>
          <Plus aria-hidden /> Nuovo brano
        </Button>
      </div>
      <CheckList
        label={`Brani (${selected.length} selezionati)`}
        items={available.map((s) => ({
          id: s.id,
          label: s.title,
          sub: [s.artist, `${s.items?.length ?? 0} materiali`].filter(Boolean).join(" · "),
        }))}
        selected={selected}
        onChange={setSelected}
        emptyText={songs.isPending ? "Caricamento…" : "Nessun brano da aggiungere: creane uno con “Nuovo brano”."}
        maxHeight="max-h-96"
      />
      <FormActions onCancel={onDone} submitting={add.isPending} submitLabel="Aggiungi" />
    </form>
    {/* Fuori dal form: gli eventi React attraversano i portali e il submit del brano arriverebbe qui. */}
    <SongDialog open={creating} onOpenChange={setCreating} song={null} onCreated={(id) => setSelected((xs) => [...xs, id])} />
    </>
  );
}