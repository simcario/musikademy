"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, Pencil, Phone, Power, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/brand";
import { ConfirmDialog, FormDialog } from "@/components/shared/dialogs";
import { PageContainer } from "@/components/shared/page";
import { FilterChips } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStaffMutation, useStudent, useStudentNotes } from "@/features/admin/hooks";
import { useCourses } from "@/features/student-area/hooks";
import { InviteShare } from "@/features/students/invite-share";
import { StudentFormDialog } from "@/features/students/student-form";
import type { InviteInfo } from "@/lib/auth/invite-token";
import {
  StudentAssignmentsTab,
  StudentAttendanceTab,
  StudentLessonsTab,
  StudentMaterialsTab,
  StudentNotesTab,
  StudentOverviewTab,
  StudentPaymentsTab,
} from "@/features/students/student-tabs";
import { studentService } from "@/services/studentService";
import { toCourseMap } from "@/services/userService";
import { formatDate, fullName } from "@/utils/format";

const TABS = [
  { value: "overview", label: "Panoramica" },
  { value: "lessons", label: "Lezioni" },
  { value: "attendance", label: "Presenze" },
  { value: "materials", label: "Materiali" },
  { value: "exercises", label: "Esercizi" },
  { value: "payments", label: "Pagamenti" },
  { value: "notes", label: "Note" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  return (
    <Suspense>
      <StudentProfile studentId={studentId} />
    </Suspense>
  );
}

function StudentProfile({ studentId }: { studentId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const tab = (TABS.find((t) => t.value === search.get("tab"))?.value ?? "overview") as Tab;
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
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const newInvite = useStaffMutation(() => studentService.createInvite(studentId), {
    success: "Nuovo invito creato: i link precedenti non valgono più",
    invalidate: [],
    onSuccess: setInvite,
  });

  if (student.isPending) return <PageContainer><ListSkeleton rows={3} /></PageContainer>;
  if (student.isError) return <PageContainer><ErrorState error={student.error} onRetry={() => student.refetch()} /></PageContainer>;
  if (!s) return <PageContainer><EmptyState title="Studente non trovato" /></PageContainer>;
  const name = fullName(s);

  return (
    <PageContainer className="max-w-5xl">
      <Link href="/admin/students" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-ink">
        <ArrowLeft className="size-4" aria-hidden /> Studenti
      </Link>

      <header className="card-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <UserAvatar person={s} size="xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Pill tone={s.status === "active" ? "success" : "neutral"} dot>
              {s.status === "active" ? "Attivo" : "Disattivato"}
            </Pill>
            {s.inviteStatus === "pending" && <Pill tone="warning">Invito in attesa</Pill>}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 hover:text-brand-ink">
              <Mail className="size-4" aria-hidden /> {s.email}
            </a>
            {s.phone && (
              <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-brand-ink">
                <Phone className="size-4" aria-hidden /> {s.phone}
              </a>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Iscritto dal {formatDate(s.enrollmentDate)}
            {s.courseIds.length > 0 && ` · ${s.courseIds.map((c) => courses.get(c)?.name ?? "—").join(", ")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Modifica
          </Button>
          {s.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => newInvite.mutate(undefined)} disabled={newInvite.isPending}>
              <Send aria-hidden /> Invito Google
            </Button>
          )}
          <Button variant={s.status === "active" ? "destructive" : "secondary"} size="sm" onClick={() => setConfirmStatus(true)}>
            <Power aria-hidden /> {s.status === "active" ? "Disattiva" : "Riattiva"}
          </Button>
        </div>
      </header>

      <FilterChips
        label="Sezioni studente"
        value={tab}
        onChange={(t) => router.replace(`/admin/students/${studentId}?tab=${t}`, { scroll: false })}
        options={TABS.map((t) => ({ ...t }))}
      />

      <div>
        {tab === "overview" && <StudentOverviewTab studentId={studentId} />}
        {tab === "lessons" && <StudentLessonsTab studentId={studentId} />}
        {tab === "attendance" && <StudentAttendanceTab studentId={studentId} />}
        {tab === "materials" && <StudentMaterialsTab studentId={studentId} studentName={name} />}
        {tab === "exercises" && <StudentAssignmentsTab studentId={studentId} />}
        {tab === "payments" && <StudentPaymentsTab studentId={studentId} />}
        {tab === "notes" && <StudentNotesTab studentId={studentId} initial={notes.data ?? ""} loading={notes.isPending} />}
      </div>

      <StudentFormDialog open={editing} onOpenChange={setEditing} student={s} notes={notes.data} />
      <FormDialog open={!!invite} onOpenChange={(o) => !o && setInvite(null)} title={`Invito per ${name}`}>
        {invite && <InviteShare invite={invite} student={s} />}
      </FormDialog>
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
    </PageContainer>
  );
}
