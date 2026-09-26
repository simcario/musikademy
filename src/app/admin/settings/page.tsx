"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing, GraduationCap, Pencil, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/brand";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { useCourses, useTeachers } from "@/features/student-area/hooks";
import { can } from "@/lib/auth/roles";
import { emailField } from "@/lib/validation";
import { enablePush, pushConfigured } from "@/lib/firebase/messaging";
import { adminApi, authService } from "@/services/authService";
import { courseService } from "@/services/userService";
import type { Course, WithId } from "@/types";
import { errorMessage } from "@/utils/errors";
import { fullName } from "@/utils/format";

export default function SettingsPage() {
  const { role } = useSession();
  const isAdmin = can(role, "settings:manage");
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Impostazioni" />
      {!isAdmin && (
        <p className="rounded-lg bg-info-soft p-3 text-sm text-info">
          Corsi e docenti sono gestiti dall&apos;amministratore. Qui puoi consultarli.
        </p>
      )}
      <CoursesSection editable={isAdmin} />
      <TeachersSection editable={isAdmin} />
      <NotificationsSection />
    </PageContainer>
  );
}

// ─────────────── Corsi ───────────────
const courseSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(100),
  description: z.string().max(500).optional(),
  active: z.boolean(),
  teacherIds: z.array(z.string()),
});
type CourseValues = z.infer<typeof courseSchema>;

function CoursesSection({ editable }: { editable: boolean }) {
  const q = useCourses();
  const [editing, setEditing] = useState<WithId<Course> | "new" | null>(null);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="size-5 text-brand-ink" aria-hidden /> Corsi
        </h2>
        {editable && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> Nuovo corso
          </Button>
        )}
      </div>
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState icon={GraduationCap} title="Nessun corso" description="I corsi servono per raggruppare studenti, materiali e comunicazioni." />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {q.data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
              </div>
              {!c.active && <Pill tone="neutral">Non attivo</Pill>}
              {editable && (
                <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label={`Modifica ${c.name}`}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Nuovo corso" : "Modifica corso"}>
        {editing && <CourseForm course={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </FormDialog>
    </section>
  );
}

function CourseForm({ course, onDone }: { course: WithId<Course> | null; onDone: () => void }) {
  const teachers = useTeachers();
  const form = useForm<CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      name: course?.name ?? "",
      description: course?.description ?? "",
      active: course?.active ?? true,
      teacherIds: course?.teacherIds ?? [],
    },
  });
  const save = useStaffMutation(async (v: CourseValues) => { if (course) await courseService.update(course.id, v); else await courseService.create(v); }, {
    success: course ? "Corso aggiornato" : "Corso creato",
    invalidate: [["courses"]],
    onSuccess: onDone,
  });
  const { errors } = form.formState;
  const watch_teacherIds = useWatch({ control: form.control, name: "teacherIds" });
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Nome" error={errors.name?.message} required>
        {(p) => <Input {...p} placeholder="Canto moderno" {...form.register("name")} />}
      </Field>
      <Field label="Descrizione">{(p) => <Textarea {...p} rows={2} {...form.register("description")} />}</Field>
      <CheckList
        label="Docenti"
        items={(teachers.data ?? []).map((t) => ({ id: t.id, label: fullName(t), sub: t.email }))}
        selected={watch_teacherIds}
        onChange={(ids) => form.setValue("teacherIds", ids)}
        maxHeight="max-h-40"
      />
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="size-[18px] accent-primary" {...form.register("active")} /> Corso attivo
      </label>
      <FormActions onCancel={onDone} submitting={save.isPending} />
    </form>
  );
}

// ─────────────── Docenti ───────────────
const teacherSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(60),
  surname: z.string().trim().min(1, "Inserisci il cognome").max(60),
  email: emailField("Email non valida"),
  role: z.enum(["teacher", "admin"]),
});
type TeacherValues = z.infer<typeof teacherSchema>;

function TeachersSection({ editable }: { editable: boolean }) {
  const q = useTeachers();
  const [creating, setCreating] = useState(false);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-brand-ink" aria-hidden /> Docenti e amministratori
        </h2>
        {editable && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus aria-hidden /> Nuovo docente
          </Button>
        )}
      </div>
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {q.data.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <UserAvatar person={t} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{fullName(t)}</p>
                <p className="truncate text-xs text-muted-foreground">{t.email}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <FormDialog open={creating} onOpenChange={setCreating} title="Nuovo docente" description="Riceverà un'email per impostare la password.">
        {creating && <TeacherForm onDone={() => setCreating(false)} />}
      </FormDialog>
    </section>
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

// ─────────────── Notifiche ───────────────
function NotificationsSection() {
  const { uid } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card-surface space-y-2 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <BellRing className="size-5 text-brand-ink" aria-hidden /> Notifiche push
      </h2>
      {pushConfigured() ? (
        <>
          <p className="text-sm text-muted-foreground">Abilita le notifiche su questo dispositivo.</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (await enablePush(uid)) toast.success("Notifiche abilitate su questo dispositivo");
                else toast.info("Notifiche non abilitate: permesso negato o browser non supportato.");
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Abilita notifiche
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Infrastruttura predisposta. Per attivarla configura la chiave VAPID (NEXT_PUBLIC_FIREBASE_VAPID_KEY) — vedi README.
        </p>
      )}
    </section>
  );
}
