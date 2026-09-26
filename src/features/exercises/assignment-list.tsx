"use client";

import { useState } from "react";
import { BookOpen, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
import { AssignmentBadge } from "@/components/shared/status-badge";
import { useAssignmentsPage, useStaffMutation } from "@/features/admin/hooks";
import { assignmentService } from "@/services/assignmentService";
import type { Assignment, AssignmentStatus, WithId } from "@/types";
import { formatDate } from "@/utils/format";
import { ASSIGNMENT_META } from "@/utils/status";
import { AssignmentFormDialog } from "./assignment-form";

/** Esercizi assegnati con stato di avanzamento dello studente (visibile al docente, §13). */
export function StaffAssignmentList({ studentId }: { studentId?: string }) {
  const [status, setStatus] = useState<AssignmentStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WithId<Assignment> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Assignment> | null>(null);
  const q = useAssignmentsPage({ studentId, status });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const remove = useStaffMutation((a: WithId<Assignment>) => assignmentService.remove(a.id), {
    success: "Esercizio eliminato",
    invalidate: [["assignments"]],
    onSuccess: () => setToDelete(null),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as AssignmentStatus | "all")} aria-label="Stato" className="w-48">
          <option value="all">Tutti gli stati</option>
          {(["todo", "in_progress", "completed"] as const).map((s) => (
            <option key={s} value={s}>
              {ASSIGNMENT_META[s].label}
            </option>
          ))}
        </NativeSelect>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden /> Assegna esercizio
        </Button>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={BookOpen} title="Nessun esercizio" />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {!studentId && `${a.studentName} · `}Assegnato {formatDate(a.assignedAt, "d MMM")}
                  {a.dueDate && ` · Scadenza ${formatDate(a.dueDate, "d MMM")}`}
                </p>
              </button>
              <AssignmentBadge status={a.status} />
              <DropdownMenu>
                <DropdownMenuTrigger aria-label={`Azioni ${a.title}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                  <MoreVertical className="size-5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="min-h-10" onClick={() => setEditing(a)}>
                    <Pencil aria-hidden /> Modifica
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(a)}>
                    <Trash2 aria-hidden /> Elimina
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
      <AssignmentFormDialog open={creating} onOpenChange={setCreating} defaults={{ studentIds: studentId ? [studentId] : [] }} />
      <AssignmentFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} assignment={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare l'esercizio?"
        description="Lo studente non lo vedrà più."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </div>
  );
}
