"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Pencil, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStaffMutation } from "@/features/admin/hooks";
import { AREA_PERMISSIONS, MANAGE_PERMISSIONS, permissionsForKind, type RoleKind } from "@/lib/auth/roles";
import { roleService, type OrgRole } from "@/services/roleService";
import { useRoles } from "./hooks";
import { roleFormSchema, type RoleFormValues } from "./schemas";

export const KIND_LABEL: Record<RoleKind, string> = { member: "Area personale", staff: "Staff" };

const KIND_HINT: Record<RoleKind, string> = {
  member: "Entra nell'area personale (come gli studenti, con invito Google) e vede solo i contenuti condivisi con lui.",
  staff: "Entra nell'area di gestione (con email e password) e gestisce le sezioni scelte.",
};

const metaOf = (kind: RoleKind) => (kind === "member" ? AREA_PERMISSIONS : MANAGE_PERMISSIONS);

function permissionSummary(r: OrgRole): string {
  if (r.id === "admin") return "Accesso completo, compresi ruoli e impostazioni";
  const labels = metaOf(r.kind)
    .filter((p) => r.permissions.includes(p.id))
    .map((p) => p.label);
  return labels.length ? labels.join(" · ") : "Nessuna sezione";
}

/**
 * Scheda "Ruoli" di Organizzazione (ADR D31): la funzione delle persone nella scuola e cosa possono fare
 * nell'app. Solo l'amministratore la vede; `creating` è pilotato dalla pagina ("Nuovo ruolo").
 */
export function RolesTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (o: boolean) => void }) {
  const q = useRoles();
  const [editing, setEditing] = useState<OrgRole | null>(null);
  const [toDelete, setToDelete] = useState<OrgRole | null>(null);
  const remove = useStaffMutation((r: OrgRole) => roleService.remove(r.id), {
    success: "Ruolo eliminato",
    invalidate: [["roles"]],
    onSuccess: () => setToDelete(null),
  });

  const section = (kind: RoleKind) => {
    const roles = (q.data ?? []).filter((r) => r.kind === kind);
    return (
      <section aria-label={KIND_LABEL[kind]} className="space-y-2">
        <div>
          <h2 className="section-label">{KIND_LABEL[kind]}</h2>
          <p className="text-xs text-muted-foreground">{KIND_HINT[kind]}</p>
        </div>
        <ul className="card-surface divide-y divide-border">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-soft text-brand-ink">
                {kind === "member" ? <UserRound className="size-5" aria-hidden /> : <ShieldCheck className="size-5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {r.name}
                  {r.system && <Pill tone="neutral">Di sistema</Pill>}
                </p>
                {r.description && <p className="truncate text-xs text-muted-foreground">{r.description}</p>}
                <p className="text-xs text-muted-foreground">{permissionSummary(r)}</p>
              </div>
              {r.id === "admin" ? (
                <Lock className="mx-3 size-4 text-muted-foreground" aria-label="Non modificabile" />
              ) : (
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" aria-label={`Modifica ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil aria-hidden />
                  </Button>
                  {!r.system && (
                    <Button variant="ghost" size="icon" aria-label={`Elimina ${r.name}`} onClick={() => setToDelete(r)}>
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Il ruolo indica la funzione di una persona nella scuola (studente, musicista, docente, segreteria…) e
        decide cosa vede e cosa può fare nell&apos;app. Lo assegni quando crei l&apos;utente, o dopo dalla sua scheda.
      </p>
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState icon={ShieldCheck} title="Nessun ruolo" />
      ) : (
        <>
          {section("member")}
          {section("staff")}
        </>
      )}

      <SidePanel
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (o) return;
          onCreatingChange(false);
          setEditing(null);
        }}
        title={editing ? "Modifica ruolo" : "Nuovo ruolo"}
        description={editing?.name}
      >
        {(creating || editing) && (
          <RoleForm
            key={editing?.id ?? "new"}
            role={editing}
            onDone={() => {
              onCreatingChange(false);
              setEditing(null);
            }}
          />
        )}
      </SidePanel>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare il ruolo?"
        description="Si può eliminare solo un ruolo che non è assegnato a nessun utente."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </>
  );
}

function RoleForm({ role, onDone }: { role: OrgRole | null; onDone: () => void }) {
  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: role?.name ?? "",
      description: role?.description ?? "",
      kind: role?.kind ?? "member",
      permissions: role?.permissions ?? permissionsForKind("member").filter((p) => p !== "area:payments" && p !== "area:lessons"),
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const permissions = useWatch({ control: form.control, name: "permissions" });
  const { errors } = form.formState;
  const save = useStaffMutation(
    (v: RoleFormValues) =>
      role ? roleService.update(role.id, v).then(({ updated }) => updated) : roleService.create(v).then(() => 0),
    {
      success: (updated) =>
        role
          ? `Ruolo aggiornato${updated ? `: ${updated} ${updated === 1 ? "utente" : "utenti"} lo vedranno dal prossimo accesso (al più entro un'ora)` : ""}`
          : "Ruolo creato",
      invalidate: [["roles"]],
      onSuccess: onDone,
    },
  );

  function setKind(k: RoleKind) {
    form.setValue("kind", k);
    form.setValue("permissions", []);
  }

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Nome" error={errors.name?.message} required>
        {(p) => <Input {...p} {...form.register("name")} placeholder="Es. Musicista, Corista, Segreteria" autoFocus />}
      </Field>
      <Field label="Descrizione">
        {(p) => <Textarea {...p} rows={2} {...form.register("description")} placeholder="Funzione nella scuola (facoltativa)" />}
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-[13px] font-medium">Tipo</legend>
        {(["member", "staff"] as const).map((k) => (
          <label key={k} className="flex min-h-11 items-start gap-3 py-1 text-sm has-disabled:opacity-60">
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              disabled={!!role}
              className="mt-0.5 size-[18px] accent-primary"
            />
            <span>
              <span className="block font-medium">{KIND_LABEL[k]}</span>
              <span className="block text-xs text-muted-foreground">{KIND_HINT[k]}</span>
            </span>
          </label>
        ))}
        {role && <p className="text-xs text-muted-foreground">Il tipo di un ruolo esistente non si può cambiare.</p>}
      </fieldset>
      <CheckList
        label={kind === "member" ? "Sezioni visibili" : "Cosa può gestire"}
        items={metaOf(kind).map((p) => ({ id: p.id, label: p.label, sub: p.hint }))}
        selected={permissions}
        onChange={(ids) => form.setValue("permissions", ids, { shouldDirty: true })}
        maxHeight="max-h-none"
      />
      <p className="text-xs text-muted-foreground">
        {kind === "member"
          ? "Dashboard, profilo e informazioni sull'app sono sempre visibili."
          : "Tutto lo staff consulta l'elenco di utenti, corsi e lezioni; ruoli, corsi e impostazioni restano all'amministratore."}
      </p>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={role ? "Salva" : "Crea ruolo"} />
    </form>
  );
}