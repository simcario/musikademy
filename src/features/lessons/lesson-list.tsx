"use client";

import { useState } from "react";
import { BookOpen, CalendarDays, CalendarPlus, Copy, MoreVertical, Pencil, Trash2, XCircle } from "lucide-react";
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
import { lessonService } from "@/services/lessonService";
import type { Lesson, LessonStatus, WithId } from "@/types";
import { formatDate } from "@/utils/format";
import { LESSON_META } from "@/utils/status";
import { AssignmentFormDialog } from "@/features/exercises/assignment-form";
import { LessonFormDialog } from "./lesson-form";

/** Elenco lezioni docente con filtri, modifica, annullamento ed eliminazione. */
export function StaffLessonList({ studentId, showStudent = true }: { studentId?: string; showStudent?: boolean }) {
  const [status, setStatus] = useState<LessonStatus | "all">("all");
  const [editing, setEditing] = useState<WithId<Lesson> | null>(null);
  const [copying, setCopying] = useState<WithId<Lesson> | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Lesson> | null>(null);
  const [assignFor, setAssignFor] = useState<WithId<Lesson> | null>(null);
  const q = useLessonsPage({ studentId, status });
  const lessons = q.data?.pages.flatMap((p) => p.items) ?? [];
  const att = useAttendanceMap(lessons.map((l) => l.id));

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NativeSelect
          value={status}
          onChange={(e) => setStatus(e.target.value as LessonStatus | "all")}
          aria-label="Filtra per stato"
          className="w-48"
        >
          <option value="all">Tutte le lezioni</option>
          {(["scheduled", "completed", "cancelled"] as const).map((s) => (
            <option key={s} value={s}>
              {LESSON_META[s].label}
            </option>
          ))}
        </NativeSelect>
        <Button onClick={() => setCreating(true)}>
          <CalendarPlus aria-hidden /> Nuova lezione
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
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(l)}>
                  <p className="truncate font-semibold">{showStudent ? l.studentName : l.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {l.startTime ?? "—"} · {showStudent ? l.title : l.teacherName}
                  </p>
                </button>
                <div className="hidden sm:block">
                  {a ? <AttendanceBadge status={a.status} /> : <LessonBadge status={l.status} />}
                </div>
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
