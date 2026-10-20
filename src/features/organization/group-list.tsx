"use client";

import { useState } from "react";
import { MoreVertical, Pencil, Trash2, UsersRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, FormActions } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useScopeGetter, useStaffMutation, useStaffScope } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { useCourses } from "@/features/student-area/hooks";
import { groupService } from "@/services/groupService";
import { MAX_GROUPS_PER_STUDENT, type Student, type StudentGroup, type WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { fullName } from "@/utils/format";

export const membersOf = (groupId: string, students: WithId<Student>[] = []) =>
  students.filter((s) => s.groupIds?.includes(groupId));

/** Gruppi di un corso (sezione Organizzazione): a un gruppo si assegnano materiali e cartelle. */
export function GroupList({ groups, onOpen }: { groups: WithId<StudentGroup>[]; onOpen: (g: WithId<StudentGroup>) => void }) {
  const students = useActiveStudents();
  const [toDelete, setToDelete] = useState<WithId<StudentGroup> | null>(null);

  const getScope = useScopeGetter();
  const remove = useStaffMutation(
    (g: WithId<StudentGroup>) =>
      groupService.remove(g.id, membersOf(g.id, students.data).map((s) => s.id), getScope()),
    {
      success: "Gruppo eliminato",
      invalidate: [["groups"], ["students"], ["materials"], ["folders"]],
      onSuccess: () => setToDelete(null),
    },
  );

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {groups.map((g) => {
          const members = membersOf(g.id, students.data);
          return (
            <li key={g.id} className="flex items-center gap-1 pr-1">
              <button
                type="button"
                onClick={() => onOpen(g)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
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
                  <DropdownMenuItem className="min-h-10" onClick={() => onOpen(g)}>
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

/** `courseId` è il corso proposto per un gruppo nuovo. */
export function GroupForm({
  group,
  courseId: initialCourseId = "",
  onDone,
}: {
  group: WithId<StudentGroup> | null;
  courseId?: string;
  onDone: () => void;
}) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const courses = useCourses();
  const scope = useStaffScope();
  // Il docente crea gruppi solo nei suoi corsi (ADR D29); i gruppi senza corso sono dell'admin.
  const courseOptions = (courses.data ?? []).filter((c) => scope?.admin || scope?.courseIds.includes(c.id));
  const current = group ? membersOf(group.id, students.data).map((s) => s.id) : [];
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [courseId, setCourseId] = useState(group?.courseId ?? initialCourseId);
  // `null` finché il docente non tocca la lista: i membri attuali arrivano con gli studenti.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [touched, setTouched] = useState(false);
  const memberIds = picked ?? current;
  const trimmed = name.trim();
  // Con un corso si scelgono i suoi iscritti; chi è già nel gruppo resta in elenco per poterlo togliere.
  const candidates = (students.data ?? []).filter(
    (s) => !courseId || s.courseIds.includes(courseId) || memberIds.includes(s.id),
  );

  const save = useStaffMutation(
    async () => {
      const full = (students.data ?? []).find(
        (s) => memberIds.includes(s.id) && !current.includes(s.id) && (s.groupIds?.length ?? 0) >= MAX_GROUPS_PER_STUDENT,
      );
      if (full) throw new AppError(`${fullName(full)} fa già parte di ${MAX_GROUPS_PER_STUDENT} gruppi: è il massimo.`);
      await groupService.save(group, { name: trimmed, description: description.trim(), courseId, memberIds }, current, uid);
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
        if (trimmed && (courseId || scope?.admin) && !students.isPending) save.mutate(undefined);
      }}
    >
      <Field label="Nome" required error={touched && !trimmed ? "Inserisci un nome" : undefined}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
      </Field>
      <Field label="Descrizione">
        {(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}
      </Field>
      <Field
        label="Corso"
        required={!scope?.admin}
        error={touched && !courseId && !scope?.admin ? "Scegli il corso del gruppo" : undefined}
        hint={courseId ? "Sono elencati gli studenti iscritti al corso." : undefined}
      >
        {(p) => (
          <NativeSelect {...p} value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={courses.isPending}>
            <option value="">{scope?.admin ? "Nessun corso" : "Seleziona corso"}</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active ? "" : " (non attivo)"}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <CheckList
        label={`Studenti (${memberIds.length} selezionati)`}
        items={candidates.map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
        selected={memberIds}
        onChange={setPicked}
        emptyText={
          students.isPending ? "Caricamento…" : courseId ? "Nessuno studente iscritto a questo corso." : "Nessuno studente attivo."
        }
        maxHeight="max-h-72"
      />
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={group ? "Salva" : "Crea gruppo"} />
    </form>
  );
}
