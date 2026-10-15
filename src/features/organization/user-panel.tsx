"use client";

import { useState } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Library,
  ListChecks,
  Mail,
  MoreVertical,
  Pencil,
  Phone,
  Power,
  Send,
  StickyNote,
  Trash2,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, SidePanel } from "@/components/shared/dialogs";
import { TabBar } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStaffMutation, useStudent, useStudentNotes } from "@/features/admin/hooks";
import { useCourses } from "@/features/student-area/hooks";
import { InviteShare } from "@/features/students/invite-share";
import { StudentFormDialog } from "@/features/students/student-form";
import {
  StudentAssignmentsTab,
  StudentAttendanceTab,
  StudentCoursesTab,
  StudentGroupsTab,
  StudentLessonsTab,
  StudentMaterialsTab,
  StudentNotesTab,
  StudentOverviewTab,
  StudentPaymentsTab,
} from "@/features/students/student-tabs";
import type { InviteInfo } from "@/lib/auth/invite-token";
import { studentService } from "@/services/studentService";
import { toCourseMap } from "@/services/userService";
import { formatDate, fullName } from "@/utils/format";
import { useRoleName } from "@/features/roles/hooks";
import { PanelBody, PanelHeader, usePanel } from "./panel";

const TABS = [
  { value: "overview", label: "Panoramica", icon: LayoutDashboard },
  { value: "courses", label: "Corsi", icon: GraduationCap },
  { value: "groups", label: "Gruppi", icon: UsersRound },
  { value: "materials", label: "Materiali", icon: Library },
  { value: "lessons", label: "Lezioni", icon: CalendarDays },
  { value: "attendance", label: "Presenze", icon: ClipboardCheck },
  { value: "exercises", label: "Esercizi", icon: ListChecks },
  { value: "payments", label: "Pagamenti", icon: Wallet },
  { value: "notes", label: "Note", icon: StickyNote },
] as const;

/** Ruolo dell'organizzazione dell'utente (ADR D31). */
function RoleBadge({ roleId }: { roleId?: string }) {
  const name = useRoleName(roleId ?? "student");
  return name ? <Pill tone="secondary">{name}</Pill> : null;
}

/** Livello "utente" del pannello: dati dello studente, corsi frequentati, materiali e storico. */
export function UserPanel({ studentId, tab: tabParam }: { studentId: string; tab?: string }) {
  const panel = usePanel();
  const tab = TABS.find((t) => t.value === tabParam)?.value ?? "overview";
  const student = useStudent(studentId);
  const notes = useStudentNotes(studentId);
  const courses = toCourseMap(useCourses().data);
  const [editing, setEditing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);

  const s = student.data;
  const toggleStatus = useStaffMutation(
    () => studentService.setStatus(studentId, s?.status === "active" ? "inactive" : "active"),
    {
      success: s?.status === "active" ? "Studente disattivato" : "Studente riattivato",
      invalidate: [["students"]],
      onSuccess: () => setConfirmStatus(false),
    },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useStaffMutation(() => studentService.remove(studentId), {
    success: "Studente eliminato",
    invalidate: [["students"]],
    onSuccess: panel.back,
  });
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const newInvite = useStaffMutation(() => studentService.createInvite(studentId), {
    success: "Nuovo invito creato: i link precedenti non valgono più",
    invalidate: [],
    onSuccess: setInvite,
  });

  if (!s) {
    return (
      <>
        <PanelHeader title="Utente" />
        <PanelBody>
          {student.isPending ? (
            <ListSkeleton rows={3} />
          ) : student.isError ? (
            <ErrorState error={student.error} onRetry={() => student.refetch()} />
          ) : (
            <EmptyState title="Studente non trovato" />
          )}
        </PanelBody>
      </>
    );
  }
  const name = fullName(s);
  // Promosso allo staff: il profilo resta solo come storico, l'account si gestisce nella scheda Staff.
  const promoted = !!s.promotedAt;

  return (
    <>
      <PanelHeader
        title={name}
        badges={
          <>
            {promoted ? (
              <Pill tone="primary">Promosso allo staff</Pill>
            ) : (
              <Pill tone={s.status === "active" ? "success" : "neutral"} dot>
                {s.status === "active" ? "Attivo" : "Disattivato"}
              </Pill>
            )}
            {!promoted && s.inviteStatus === "pending" && <Pill tone="warning">Invito in attesa</Pill>}
            <RoleBadge roleId={s.roleId} />
          </>
        }
        actions={
          !promoted && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Azioni per ${name}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
              >
                <MoreVertical className="size-5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-64 max-w-[calc(100vw-2rem)]">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Contatti</DropdownMenuLabel>
                  <DropdownMenuItem className="min-h-10" onClick={() => (window.location.href = `mailto:${s.email}`)}>
                    <Mail aria-hidden /> <span className="truncate">{s.email}</span>
                  </DropdownMenuItem>
                  {s.phone && (
                    <DropdownMenuItem className="min-h-10" onClick={() => (window.location.href = `tel:${s.phone}`)}>
                      <Phone aria-hidden /> {s.phone}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-10" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden /> Modifica
                </DropdownMenuItem>
                {s.status === "active" && (
                  <DropdownMenuItem className="min-h-10" onClick={() => newInvite.mutate(undefined)} disabled={newInvite.isPending}>
                    <Send aria-hidden /> Invito Google
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant={s.status === "active" ? "destructive" : "default"}
                  className="min-h-10"
                  onClick={() => setConfirmStatus(true)}
                >
                  <Power aria-hidden /> {s.status === "active" ? "Disattiva" : "Riattiva"}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden /> Elimina studente
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <PanelBody>
        {promoted && (
          <p className="rounded-lg bg-info-soft p-3 text-sm text-info">
            Dal {formatDate(s.promotedAt!)} fa parte dello staff: qui resta lo storico da studente. Ruolo e inviti si
            gestiscono in Organizzazione › Staff.
          </p>
        )}
        <div className="space-y-2">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Mail className="size-4 shrink-0" aria-hidden /> <span className="truncate">{s.email}</span>
            </span>
            {s.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-4 shrink-0" aria-hidden /> {s.phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 shrink-0" aria-hidden /> Iscritto dal {formatDate(s.enrollmentDate)}
            </span>
          </p>
          {s.courseIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {s.courseIds.map((c) => (
                <Pill key={c} tone="primary">
                  {courses.get(c)?.name ?? "—"}
                </Pill>
              ))}
            </div>
          )}
        </div>

        <TabBar label="Sezioni studente" value={tab} onChange={panel.setTab} options={TABS.map((t) => ({ ...t }))} />

        <div>
          {tab === "overview" && <StudentOverviewTab studentId={studentId} />}
          {tab === "courses" && <StudentCoursesTab student={s} onEdit={() => setEditing(true)} />}
          {tab === "groups" && <StudentGroupsTab key={studentId} student={s} />}
          {tab === "lessons" && <StudentLessonsTab studentId={studentId} />}
          {tab === "attendance" && <StudentAttendanceTab studentId={studentId} />}
          {tab === "materials" && <StudentMaterialsTab studentId={studentId} studentName={name} />}
          {tab === "exercises" && <StudentAssignmentsTab studentId={studentId} />}
          {tab === "payments" && <StudentPaymentsTab student={s} />}
          {tab === "notes" && <StudentNotesTab studentId={studentId} initial={notes.data ?? ""} loading={notes.isPending} />}
        </div>
      </PanelBody>

      <StudentFormDialog open={editing} onOpenChange={setEditing} student={s} notes={notes.data} />
      <SidePanel open={!!invite} onOpenChange={(o) => !o && setInvite(null)} title={`Invito per ${name}`}>
        {invite && <InviteShare invite={invite} student={s} />}
      </SidePanel>
      <ConfirmDialog
        open={confirmStatus}
        onOpenChange={setConfirmStatus}
        title={s.status === "active" ? `Disattivare ${name}?` : `Riattivare ${name}?`}
        description={
          s.status === "active"
            ? "Lo studente non potrà più accedere. Lezioni, presenze e pagamenti restano nello storico."
            : "Lo studente potrà di nuovo accedere alla piattaforma."
        }
        confirmLabel={s.status === "active" ? "Disattiva" : "Riattiva"}
        destructive={s.status === "active"}
        loading={toggleStatus.isPending}
        onConfirm={() => toggleStatus.mutate(undefined)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Eliminare definitivamente ${name}?`}
        description="Verranno cancellati account, lezioni, presenze, pagamenti, esercizi e note. L'operazione non si può annullare: se vuoi solo bloccare l'accesso usa «Disattiva»."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </>
  );
}
