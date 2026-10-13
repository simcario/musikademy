"use client";

import { useState } from "react";
import { MoreVertical, Pencil, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { useActiveStudents, useGroups, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { groupService } from "@/services/groupService";
import { MAX_GROUPS_PER_STUDENT, type Student, type StudentGroup, type WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { fullName } from "@/utils/format";

const membersOf = (groupId: string, students: WithId<Student>[] = []) =>
  students.filter((s) => s.groupIds?.includes(groupId));

/**
 * Scheda "Gruppi" della sezione Studenti: gruppi a cui assegnare materiali e cartelle.
 * `creating` è pilotato dalla pagina, che ha il pulsante "Nuovo gruppo" nell'intestazione.
 */
export function GroupsTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (o: boolean) => void }) {
  const groups = useGroups();
  const students = useActiveStudents();
  const [editing, setEditing] = useState<WithId<StudentGroup> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<StudentGroup> | null>(null);

  const remove = useStaffMutation((g: WithId<StudentGroup>) => groupService.remove(g.id), {
    success: "Gruppo eliminato",
    invalidate: [["groups"], ["students"], ["materials"], ["folders"]],
    onSuccess: () => setToDelete(null),
  });

  return (
    <>
      {groups.isPending ? (
        <ListSkeleton rows={3} />
      ) : groups.isError ? (
        <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
      ) : groups.data.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nessun gruppo"
          description="Crea un gruppo per assegnare materiali e cartelle a più studenti insieme. Uno studente può far parte di più gruppi."
          action={
            <Button onClick={() => onCreatingChange(true)}>
              <UsersRound aria-hidden /> Crea il primo gruppo
            </Button>
          }
        />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {groups.data.map((g) => {
            const members = membersOf(g.id, students.data);
            return (
              <li key={g.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => setEditing(g)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet-ink">
                    <UsersRound className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {students.isPending
                        ? "Caricamento…"
                        : members.length === 0
                          ? "Nessuno studente"
                          : `${members.length} student${members.length === 1 ? "e" : "i"} · ${members.map(fullName).join(", ")}`}
                    </span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Azioni ${g.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted">
                    <MoreVertical className="size-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="min-h-10" onClick={() => setEditing(g)}>
                      <Pencil aria-hidden /> Modifica e studenti
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(g)}>
                      <Trash2 aria-hidden /> Elimina
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <FormDialog open={creating} onOpenChange={onCreatingChange} title="Nuovo gruppo">
        <GroupForm group={null} onDone={() => onCreatingChange(false)} />
      </FormDialog>
      <FormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Modifica gruppo" description={editing?.name}>
        {editing && <GroupForm key={editing.id} group={editing} onDone={() => setEditing(null)} />}
      </FormDialog>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Eliminare il gruppo “${toDelete?.name ?? ""}”?`}
        description="Gli studenti restano. Materiali e cartelle assegnati al gruppo non saranno più visibili a chi li vedeva solo grazie al gruppo."
        confirmLabel="Elimina gruppo"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </>
  );
}

function GroupForm({ group, onDone }: { group: WithId<StudentGroup> | null; onDone: () => void }) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const current = group ? membersOf(group.id, students.data).map((s) => s.id) : [];
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  // `null` finché il docente non tocca la lista: i membri attuali arrivano con gli studenti.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [touched, setTouched] = useState(false);
  const memberIds = picked ?? current;
  const trimmed = name.trim();

  const save = useStaffMutation(
    async () => {
      const full = (students.data ?? []).find(
        (s) => memberIds.includes(s.id) && !current.includes(s.id) && (s.groupIds?.length ?? 0) >= MAX_GROUPS_PER_STUDENT,
      );
      if (full) throw new AppError(`${fullName(full)} fa già parte di ${MAX_GROUPS_PER_STUDENT} gruppi: è il massimo.`);
      await groupService.save(group, { name: trimmed, description: description.trim(), memberIds }, current, uid);
    },
    { success: group ? "Gruppo aggiornato" : "Gruppo creato", invalidate: [["groups"], ["students"]], onSuccess: onDone },
  );

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (trimmed && !students.isPending) save.mutate(undefined);
      }}
    >
      <Field label="Nome" required error={touched && !trimmed ? "Inserisci un nome" : undefined}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
      </Field>
      <Field label="Descrizione">
        {(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}
      </Field>
      <CheckList
        label={`Studenti (${memberIds.length} selezionati)`}
        items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
        selected={memberIds}
        onChange={setPicked}
        emptyText={students.isPending ? "Caricamento…" : "Nessuno studente attivo."}
        maxHeight="max-h-72"
      />
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={group ? "Salva" : "Crea gruppo"} />
    </form>
  );
}
