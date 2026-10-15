"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, UserPlus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { UserAvatar } from "@/components/shared/brand";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { useRolesOfKind } from "@/features/roles/hooks";
import { useTeachers } from "@/features/student-area/hooks";
import { emailField } from "@/lib/validation";
import { adminApi, authService } from "@/services/authService";
import type { Teacher, WithId } from "@/types";
import { byName, sortName } from "@/utils/format";

const staffSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(60),
  surname: z.string().trim().min(1, "Inserisci il cognome").max(60),
  email: emailField("Email non valida"),
  roleId: z.string().min(1, "Scegli il ruolo"),
});
type StaffValues = z.infer<typeof staffSchema>;

/**
 * Staff (docenti, segreteria, amministratori…; ADR D31): solo l'admin crea account e cambia ruoli,
 * gli altri li consultano.
 */
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
  const roles = useRolesOfKind("staff");
  const teachers = [...(q.data ?? [])].sort(byName);
  return (
    <>
      {!editable && (
        <p className="rounded-lg bg-info-soft p-3 text-sm text-info">
          Lo staff è gestito dall&apos;amministratore. Qui puoi consultarlo.
        </p>
      )}
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : teachers.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nessun membro dello staff"
          action={
            editable && (
              <Button onClick={() => onCreatingChange(true)}>
                <UserPlus aria-hidden /> Aggiungi il primo
              </Button>
            )
          }
        />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {teachers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <UserAvatar person={t} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{sortName(t)}</p>
                <p className="truncate text-xs text-muted-foreground">{t.email}</p>
              </div>
              {editable ? (
                <StaffRoleSelect teacher={t} />
              ) : (
                <Pill tone="secondary">{roles.data?.find((r) => r.id === (t.roleId ?? "teacher"))?.name ?? "Docente"}</Pill>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <SidePanel
          open={creating}
          onOpenChange={onCreatingChange}
          title="Nuovo membro dello staff"
          description="Riceverà un'email per impostare la password."
        >
          {creating && <StaffForm onDone={() => onCreatingChange(false)} />}
        </SidePanel>
      )}
    </>
  );
}

/** Cambio di ruolo (admin): i nuovi permessi valgono dal prossimo accesso dell'utente. */
function StaffRoleSelect({ teacher }: { teacher: WithId<Teacher> }) {
  const { uid } = useSession();
  const roles = useRolesOfKind("staff");
  const current = teacher.roleId ?? "teacher";
  const change = useStaffMutation(
    (roleId: string) => adminApi(`users/${teacher.id}`, { method: "PATCH", body: { roleId } }),
    { success: "Ruolo aggiornato: varrà dal prossimo accesso", invalidate: [["teachers"]] },
  );
  return (
    <NativeSelect
      aria-label={`Ruolo di ${sortName(teacher)}`}
      value={current}
      onChange={(e) => change.mutate(e.target.value)}
      // Nessuno cambia il proprio ruolo (rischio di togliersi l'accesso da admin).
      disabled={teacher.id === uid || change.isPending || roles.isPending}
      title={teacher.id === uid ? "Non puoi cambiare il tuo ruolo" : undefined}
      className="w-44"
    >
      {(roles.data ?? []).map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function StaffForm({ onDone }: { onDone: () => void }) {
  const roles = useRolesOfKind("staff");
  const form = useForm<StaffValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: "", surname: "", email: "", roleId: "teacher" },
  });
  const save = useStaffMutation(
    async (v: StaffValues) => {
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
      <Field label="Ruolo" error={errors.roleId?.message} required hint="I permessi di ogni ruolo si definiscono nella scheda Ruoli.">
        {(p) => (
          <NativeSelect {...p} {...form.register("roleId")} disabled={roles.isPending}>
            {(roles.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.id === "admin" ? " (accesso completo)" : ""}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel="Crea account" />
    </form>
  );
}