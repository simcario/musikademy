"use client";

import { useState, type ReactNode } from "react";
import { BadgeEuro, BookOpen, CircleCheck, CalendarDays, CalendarPlus, Copy, MoreVertical, Pencil, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { AttendanceBadge, LessonBadge } from "@/components/shared/status-badge";
import { useAttendanceMap, useLessonsPage, useStaffMutation } from "@/features/admin/hooks";
import { AttendanceButton, AttendanceDialog } from "@/features/attendance/attendance-picker";
import { StudentSelect } from "@/features/admin/pickers";
import { LessonPaidBadge, LessonPaymentDialog, useCanRecordPayment, usePaidLessons, type LessonPaymentMode } from "@/features/payments/lesson-payments";
import { lessonService } from "@/services/lessonService";
import type { Lesson, LessonStatus, WithId } from "@/types";
import { formatDate } from "@/utils/format";
import { LESSON_META } from "@/utils/status";
import { AssignmentFormDialog } from "@/features/exercises/assignment-form";
import { LessonFormDialog } from "./lesson-form";

/** Elenco lezioni docente con filtri, modifica, annullamento ed eliminazione. */
export function StaffLessonList({
  studentId,
  showStudent = true,
  toolbar,
}: {
  studentId?: string;
  showStudent?: boolean;
  /** Controlli extra a inizio riga (es. selettore elenco/calendario). */
  toolbar?: ReactNode;
}) {
  const [status, setStatus] = useState<LessonStatus | "all">("all");
  const [filterStudent, setFilterStudent] = useState("");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [payFor, setPayFor] = useState<{ lesson: WithId<Lesson>; mode: LessonPaymentMode } | null>(null);
  const [editing, setEditing] = useState<WithId<Lesson> | null>(null);
  const [copying, setCopying] = useState<WithId<Lesson> | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Lesson> | null>(null);
  const [assignFor, setAssignFor] = useState<WithId<Lesson> | null>(null);
  const q = useLessonsPage({ studentId: studentId ?? (filterStudent || undefined), status });
  const loaded = q.data?.pages.flatMap((p) => p.items) ?? [];
  const ids = loaded.map((l) => l.id);
  const att = useAttendanceMap(ids);
  // Pagamento: solo per le proprie lezioni (le quote sono del docente, ADR D34).
  const canPay = useCanRecordPayment();
  const payable = loaded.filter((l) => canPay(l) && l.status !== "cancelled");
  const paid = usePaidLessons(payable.map((l) => l.id), payable.length > 0);
  const isPaid = (l: WithId<Lesson>) => !!paid.data?.has(l.id);
  // Il filtro sul pagamento agisce sulle lezioni caricate (le pagine successive con "Carica altre").
  const lessons =
    paidFilter === "all"
      ? loaded
      : loaded.filter((l) => canPay(l) && l.status !== "cancelled" && (paidFilter === "paid") === isPaid(l));
  const [attFor, setAttFor] = useState<WithId<Lesson> | null>(null);

  const cancel = useStaffMutation((l: WithId<Lesson>) => lessonService.setStatus(l.id, "cancelled"), {
    success: "Lezione annullata",
    invalidate: [["lessons"], ["stats"]],
  });
  const remove = useStaffMutation((l: WithId<Lesson>) => lessonService.remove(l.id), {
    success: "Lezione eliminata",
    invalidate: [["lessons"], ["stats"]],
    onSuccess: () => setToDelete(null),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        {!studentId && (
          <StudentSelect
            value={filterStudent}
            onChange={(e) => setFilterStudent(e.target.value)}
            placeholder="Tutti gli studenti"
            aria-label="Filtra per studente"
            className="min-w-0 flex-1 sm:w-52 sm:flex-none"
          />
        )}
        <NativeSelect
          value={paidFilter}
          onChange={(e) => setPaidFilter(e.target.value as "all" | "paid" | "unpaid")}
          aria-label="Filtra per pagamento"
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        >
          <option value="all">Pagate e da pagare</option>
          <option value="paid">Solo pagate</option>
          <option value="unpaid">Solo da pagare</option>
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={(e) => setStatus(e.target.value as LessonStatus | "all")}
          aria-label="Filtra per stato"
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
        >
          <option value="all">Tutte le lezioni</option>
          {(["scheduled", "completed", "cancelled"] as const).map((s) => (
            <option key={s} value={s}>
              {LESSON_META[s].label}
            </option>
          ))}
        </NativeSelect>
        <Button className="ml-auto shrink-0" aria-label="Nuova lezione" onClick={() => setCreating(true)}>
          <CalendarPlus aria-hidden /> <span className={toolbar ? "hidden sm:inline" : undefined}>Nuova lezione</span>
        </Button>
      </div>

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : lessons.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nessuna lezione" />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {lessons.map((l) => {
            const a = att.data?.get(l.id);
            return (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">{formatDate(l.date, "MMM")}</p>
                  <p className="text-lg leading-none font-bold">{formatDate(l.date, "d")}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <button type="button" className="block w-full min-w-0 text-left" onClick={() => setEditing(l)}>
                    <p className="truncate font-semibold">{showStudent ? l.studentName : l.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {l.startTime ?? "—"} · {showStudent ? l.title : l.teacherName}
                    </p>
                  </button>
                  {canPay(l) && l.status !== "cancelled" && paid.isSuccess && (isPaid(l) || l.status === "completed") && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <LessonPaidBadge paid={isPaid(l)} />
                      {!isPaid(l) && (
                        <button
                          type="button"
                          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-brand-ink hover:bg-indigo-soft"
                          onClick={() => setPayFor({ lesson: l, mode: "link" })}
                        >
                          <CircleCheck className="size-3.5" aria-hidden /> Segna come pagata
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="hidden sm:block">
                  {a ? <AttendanceBadge status={a.status} /> : <LessonBadge status={l.status} />}
                </div>
                <AttendanceButton studentName={l.studentName} status={a?.status} onClick={() => setAttFor(l)} />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Azioni lezione ${l.title}`}
                    className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
                  >
                    <MoreVertical className="size-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-10" onClick={() => setEditing(l)}>
                      <Pencil aria-hidden /> Modifica
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-10" onClick={() => setCopying(l)}>
                      <Copy aria-hidden /> Copia lezione
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-10" onClick={() => setAssignFor(l)}>
                      <BookOpen aria-hidden /> Assegna esercizio
                    </DropdownMenuItem>
                    {canPay(l) && l.status !== "cancelled" && paid.isSuccess && (isPaid(l) ? (
                      <DropdownMenuItem className="min-h-10" onClick={() => setPayFor({ lesson: l, mode: "ask" })}>
                        <BadgeEuro aria-hidden /> Pagamento
                      </DropdownMenuItem>
                      ) : (
                      <>
                        <DropdownMenuItem className="min-h-10" onClick={() => setPayFor({ lesson: l, mode: "link" })}>
                          <CircleCheck aria-hidden /> Segna come pagata
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-10" onClick={() => setPayFor({ lesson: l, mode: "ask" })}>
                          <BadgeEuro aria-hidden /> Registra pagamento
                        </DropdownMenuItem>
                      </>
                      ))}
                    {l.status !== "cancelled" && (
                      <DropdownMenuItem className="min-h-10" onClick={() => cancel.mutate(l)}>
                        <XCircle aria-hidden /> Annulla lezione
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(l)}>
                      <Trash2 aria-hidden /> Elimina
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />

      <LessonFormDialog open={creating} onOpenChange={setCreating} defaults={{ studentId }} />
      <LessonFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} lesson={editing} />
      <LessonFormDialog open={!!copying} onOpenChange={(o) => !o && setCopying(null)} copyFrom={copying} />
      <AssignmentFormDialog
        open={!!assignFor}
        onOpenChange={(o) => !o && setAssignFor(null)}
        defaults={assignFor ? { studentIds: [assignFor.studentId], lessonId: assignFor.id, materialIds: assignFor.materialIds } : undefined}
      />
      <AttendanceDialog
        lesson={attFor}
        current={attFor ? att.data?.get(attFor.id) : undefined}
        lessonIds={ids}
        onOpenChange={(o) => !o && setAttFor(null)}
      />
      <LessonPaymentDialog lesson={payFor?.lesson ?? null} mode={payFor?.mode} onOpenChange={(o) => !o && setPayFor(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare la lezione?"
        description="Per lezioni già svolte preferisci «Annulla lezione»: l'eliminazione rimuove la lezione dallo storico."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </div>
  );
}
