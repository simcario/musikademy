"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, UserPlus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/shared/brand";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { useStaffMutation } from "@/features/admin/hooks";
import { useCourses, useTeachers } from "@/features/student-area/hooks";
import { emailField } from "@/lib/validation";
import { adminApi, authService } from "@/services/authService";
import { byName, sortName } from "@/utils/format";

const teacherSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(60),
  surname: z.string().trim().min(1, "Inserisci il cognome").max(60),
  email: emailField("Email non valida"),
  role: z.enum(["teacher", "admin"]),
});
type TeacherValues = z.infer<typeof teacherSchema>;

/** Docenti e amministratori: solo l'admin ne crea di nuovi, gli altri docenti li consultano. */
export function TeachersTab({
  editable,
  creating,
  onCreatingChange,
}: {
  editable: boolean;
  creating: boolean;
  onCreatingChange: (o: boolean) => void;
}) {
  const q = useTeachers();
  const courses = useCourses();
  const teachers = [...(q.data ?? [])].sort(byName);
  // Corsi e materie a cui ogni docente è abilitato (ADR D29): si impostano dal corso.
  const teachingOf = (id: string) =>
    (courses.data ?? [])
      .filter((c) => c.teacherIds.includes(id))
      .map((c) => {
        const subjects = (c.subjects ?? []).filter((s) => s.teacherIds.includes(id)).map((s) => s.name);
        return subjects.length ? `${c.name} (${subjects.join(", ")})` : c.name;
      });
  return (
    <>
      {!editable && (
        <p className="rounded-lg bg-info-soft p-3 text-sm text-info">
          I docenti sono gestiti dall&apos;amministratore. Qui puoi consultarli.
        </p>
      )}
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : teachers.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nessun docente"
          action={
            editable && (
              <Button onClick={() => onCreatingChange(true)}>
                <UserPlus aria-hidden /> Aggiungi il primo docente
              </Button>
            )
          }
        />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {teachers.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <UserAvatar person={t} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{sortName(t)}</p>
                <p className="truncate text-xs text-muted-foreground">{t.email}</p>
                <p className="text-xs text-muted-foreground">
                  {teachingOf(t.id).join(" · ") || "Nessun corso: abilitalo dalla scheda di un corso"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <SidePanel open={creating} onOpenChange={onCreatingChange} title="Nuovo docente" description="Riceverà un'email per impostare la password.">
          {creating && <TeacherForm onDone={() => onCreatingChange(false)} />}
        </SidePanel>
      )}
    </>
  );
}

function TeacherForm({ onDone }: { onDone: () => void }) {
  const form = useForm<TeacherValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: { name: "", surname: "", email: "", role: "teacher" },
  });
  const save = useStaffMutation(
    async (v: TeacherValues) => {
      await adminApi("users", { method: "POST", body: { ...v, courseIds: [] } });
      await authService.sendPasswordReset(v.email).catch(() => undefined);
    },
    { success: "Account creato e invito inviato", invalidate: [["teachers"]], onSuccess: onDone },
  );
  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" error={errors.name?.message} required>
          {(p) => <Input {...p} {...form.register("name")} />}
        </Field>
        <Field label="Cognome" error={errors.surname?.message} required>
          {(p) => <Input {...p} {...form.register("surname")} />}
        </Field>
      </div>
      <Field label="Email" error={errors.email?.message} required>
        {(p) => <Input {...p} type="email" {...form.register("email")} />}
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-[13px] font-medium">Ruolo</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="radio" value="teacher" className="size-[18px] accent-primary" {...form.register("role")} /> Docente
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="radio" value="admin" className="size-[18px] accent-primary" {...form.register("role")} /> Amministratore
          (accesso completo)
        </label>
      </fieldset>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel="Crea account" />
    </form>
  );
}
