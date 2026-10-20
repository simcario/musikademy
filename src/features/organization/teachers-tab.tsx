"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, ShieldCheck, UserPlus } from "lucide-react";
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
import { useCourses, useTeachers } from "@/features/student-area/hooks";
import { InviteShare } from "@/features/students/invite-share";
import type { InviteInfo } from "@/lib/auth/invite-token";
import { emailField } from "@/lib/validation";
import { adminApi } from "@/services/authService";
import type { Teacher, WithId } from "@/types";
import { byName, sortName } from "@/utils/format";

const staffSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(60),
  surname: z.string().trim().min(1, "Inserisci il cognome").max(60),
  email: emailField("Email non valida"),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ()./-]*$/, "Numero di telefono non valido"),
  roleId: z.string().min(1, "Scegli il ruolo"),
});
type StaffValues = z.infer<typeof staffSchema>;

/** Destinatario del link d'invito da condividere (WhatsApp, email, copia). */
type InviteTarget = { name: string; email: string; phone?: string; invite: InviteInfo };

/**
 * Staff (docenti, segreteria, amministratori…; ADR D31): solo l'admin crea account e cambia ruoli,
 * gli altri li consultano. Come per gli studenti, l'accesso avviene con Google tramite invito (ADR D20).
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
  const [invite, setInvite] = useState<InviteTarget | null>(null);
  const newInvite = useStaffMutation(
    async (t: WithId<Teacher>) => ({
      name: t.name,
      email: t.email,
      phone: t.phone || undefined,
      invite: await adminApi<InviteInfo>(`users/${t.id}/invite`, { method: "POST" }),
    }),
    { success: "Nuovo invito creato: i link precedenti non valgono più", invalidate: [], onSuccess: setInvite },
  );
  const courses = useCourses();
  const teachers = [...(q.data ?? [])].sort(byName);
  // Corsi e materie a cui ogni docente è abilitato (ADR D34): si impostano dal corso.
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
                <p className="text-xs text-muted-foreground">
                  {teachingOf(t.id).join(" · ") || "Nessun corso: abilitalo dalla scheda di un corso"}
                </p>
              </div>
              {t.inviteStatus === "pending" && <Pill tone="warning">Invito in attesa</Pill>}
              {editable ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => newInvite.mutate(t)}
                    disabled={newInvite.isPending}
                    aria-label={`Invito Google per ${sortName(t)}`}
                  >
                    <Send aria-hidden /> Invito
                  </Button>
                  <StaffRoleSelect teacher={t} />
                </>
              ) : (
                <Pill tone="secondary">{roles.data?.find((r) => r.id === (t.roleId ?? "teacher"))?.name ?? "Docente"}</Pill>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <>
          <StaffFormDialog open={creating} onOpenChange={onCreatingChange} />
          <SidePanel open={!!invite} onOpenChange={(o) => !o && setInvite(null)} title={`Invito per ${invite?.name ?? ""}`}>
            {invite && <InviteShare invite={invite.invite} student={invite} />}
          </SidePanel>
        </>
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

function StaffFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [created, setCreated] = useState<InviteTarget | null>(null);
  const close = (o: boolean) => {
    if (!o) setCreated(null);
    onOpenChange(o);
  };
  return (
    <SidePanel
      open={open}
      onOpenChange={close}
      title={created ? "Account creato" : "Nuovo membro dello staff"}
      description={created ? undefined : "Riceverai un link d'invito da inviargli per accedere con Google."}
    >
      {created ? (
        <div className="space-y-4 pb-2">
          <InviteShare invite={created.invite} student={created} />
          <Button className="w-full" onClick={() => close(false)}>
            Fatto
          </Button>
        </div>
      ) : (
        open && <StaffForm onCancel={() => close(false)} onCreated={setCreated} />
      )}
    </SidePanel>
  );
}

function StaffForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: InviteTarget) => void }) {
  const roles = useRolesOfKind("staff");
  const form = useForm<StaffValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: "", surname: "", email: "", phone: "", roleId: "teacher" },
  });
  const save = useStaffMutation(
    async (v: StaffValues) => {
      const res = await adminApi<{ uid: string; invite: InviteInfo }>("users", {
        method: "POST",
        body: { ...v, courseIds: [] },
      });
      return { name: v.name, email: v.email, phone: v.phone || undefined, invite: res.invite };
    },
    { success: "Account creato", invalidate: [["teachers"]], onSuccess: onCreated },
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message} required>
          {(p) => <Input {...p} type="email" inputMode="email" {...form.register("email")} />}
        </Field>
        <Field label="Telefono" error={errors.phone?.message} hint="Per inviare l'invito su WhatsApp.">
          {(p) => <Input {...p} type="tel" {...form.register("phone")} />}
        </Field>
      </div>
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
      <FormActions onCancel={onCancel} submitting={save.isPending} submitLabel="Crea account" />
    </form>
  );
}
