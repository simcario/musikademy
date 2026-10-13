"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useFolders, useGroups, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { folderService } from "@/services/folderService";
import { materialService } from "@/services/materialService";
import type { Material, MaterialFolder, WithId } from "@/types";
import { fullName } from "@/utils/format";

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void };

/** Nuova cartella, oppure rinomina di `folder`. */
export function FolderNameDialog({
  open,
  onOpenChange,
  folder,
  onCreated,
}: DialogProps & { folder?: WithId<MaterialFolder> | null; onCreated?: (id: string) => void }) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={folder ? "Rinomina cartella" : "Nuova cartella"}>
      <FolderNameForm key={folder?.id ?? "new"} folder={folder ?? null} onCreated={onCreated} onDone={() => onOpenChange(false)} />
    </FormDialog>
  );
}

function FolderNameForm({
  folder,
  onCreated,
  onDone,
}: {
  folder: WithId<MaterialFolder> | null;
  onCreated?: (id: string) => void;
  onDone: () => void;
}) {
  const { uid } = useSession();
  const [name, setName] = useState(folder?.name ?? "");
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const save = useStaffMutation(
    async () => {
      if (folder) await folderService.rename(folder.id, trimmed);
      else onCreated?.(await folderService.create(trimmed, uid));
    },
    { success: folder ? "Cartella rinominata" : "Cartella creata", invalidate: [["folders"]], onSuccess: onDone },
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
      <Field label="Nome" required error={touched && !trimmed ? "Inserisci un nome" : undefined}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />}
      </Field>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={folder ? "Salva" : "Crea"} />
    </form>
  );
}

/** Condivisione di una cartella: tutti i materiali che contiene diventano visibili a studenti e gruppi scelti. */
export function FolderShareDialog({ open, onOpenChange, folder }: DialogProps & { folder: WithId<MaterialFolder> | null }) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Condividi cartella" description={folder?.name}>
      {folder && <FolderShareForm key={folder.id} folder={folder} onDone={() => onOpenChange(false)} />}
    </FormDialog>
  );
}

function FolderShareForm({ folder, onDone }: { folder: WithId<MaterialFolder>; onDone: () => void }) {
  const students = useActiveStudents();
  const groups = useGroups();
  const [studentIds, setStudentIds] = useState(folder.studentIds ?? []);
  const [groupIds, setGroupIds] = useState(folder.groupIds ?? []);
  const share = useStaffMutation(() => folderService.share(folder.id, { studentIds, groupIds }), {
    success: "Condivisione aggiornata",
    invalidate: [["folders"], ["materials"]],
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
        Chi scegli qui vede tutti i materiali della cartella, anche quelli che aggiungerai in seguito.
      </p>
      <CheckList
        label={`Gruppi (${groupIds.length} selezionati)`}
        items={(groups.data ?? []).map((g) => ({ id: g.id, label: g.name, sub: g.description }))}
        selected={groupIds}
        onChange={setGroupIds}
        emptyText={groups.isPending ? "Caricamento…" : "Nessun gruppo: creali in Studenti → Gruppi."}
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

/** Sposta un materiale in una cartella (o fuori da tutte). */
export function MoveToFolderDialog({ open, onOpenChange, material }: DialogProps & { material: WithId<Material> | null }) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Sposta in cartella" description={material?.title}>
      {material && <MoveForm key={material.id} material={material} onDone={() => onOpenChange(false)} />}
    </FormDialog>
  );
}

function MoveForm({ material, onDone }: { material: WithId<Material>; onDone: () => void }) {
  const [folderId, setFolderId] = useState(material.folderId ?? "");
  const move = useStaffMutation(() => materialService.moveToFolder(material, folderId || null), {
    success: "Materiale spostato",
    invalidate: [["materials"]],
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        move.mutate(undefined);
      }}
    >
      <Field label="Cartella" hint="Il materiale diventa visibile anche a chi ha accesso alla cartella.">
        {(p) => <FolderSelect {...p} value={folderId} onChange={(e) => setFolderId(e.target.value)} />}
      </Field>
      <FormActions onCancel={onDone} submitting={move.isPending} submitLabel="Sposta" />
    </form>
  );
}

export function FolderSelect(props: Omit<React.ComponentProps<typeof NativeSelect>, "children">) {
  const q = useFolders();
  return (
    <NativeSelect {...props} disabled={q.isPending || props.disabled}>
      <option value="">Nessuna cartella</option>
      {q.data?.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </NativeSelect>
  );
}
