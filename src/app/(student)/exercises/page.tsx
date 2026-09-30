"use client";

import { useState } from "react";
import { CalendarCheck, CalendarX2, CircleCheckBig, Flame } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { PageContainer } from "@/components/shared/page";
import { Segmented } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { AssignmentBadge } from "@/components/shared/status-badge";
import { MaterialRow } from "@/features/materials/material-card";
import { useMaterialsByIds, useMyAssignments, useSetAssignmentStatus } from "@/features/student-area/hooks";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import type { Assignment, AssignmentStatus, WithId } from "@/types";
import { formatDate, toDate } from "@/utils/format";
import { ASSIGNMENT_META } from "@/utils/status";

const ORDER: AssignmentStatus[] = ["todo", "in_progress", "completed"];

export default function ExercisesPage() {
  const q = useMyAssignments();
  const [tab, setTab] = useState<AssignmentStatus>("todo");
  const all = q.data ?? [];
  const count = (s: AssignmentStatus) => all.filter((a) => a.status === s).length;
  const rate = all.length ? Math.round((count("completed") / all.length) * 100) : 0;
  const visible = all.filter((a) => a.status === tab);

  return (
    <PageContainer className="max-w-3xl">
      <h1 className="sr-only">Esercizi</h1>
      <ProgressHeader rate={rate} total={all.length} loading={q.isPending} />
      <Segmented
        label="Stato esercizi"
        value={tab}
        onChange={setTab}
        options={ORDER.map((s) => ({ value: s, label: ASSIGNMENT_META[s].label, count: q.isPending ? undefined : count(s) }))}
      />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={CircleCheckBig}
          title={tab === "completed" ? "Nessun esercizio completato" : "Niente da fare qui"}
          description={tab === "todo" ? "Hai completato tutto ciò che ti è stato assegnato." : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => (
            <li key={a.id}>
              <ExerciseCard assignment={a} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function ProgressHeader({ rate, total, loading }: { rate: number; total: number; loading: boolean }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <section className="flex items-center gap-4 rounded-xl bg-surface-mid p-4" aria-label="Avanzamento esercizi">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-indigo-soft text-brand-ink">
        <Flame className="size-7" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold">{loading ? "…" : `${rate}% obiettivi raggiunti`}</p>
        <p className="truncate text-sm text-muted-foreground">
          {total ? "Continua così! Ogni giorno di pratica conta." : "Nessun esercizio assegnato finora."}
        </p>
      </div>
      <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-surface-highest" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - rate / 100)}
          className="stroke-success transition-[stroke-dashoffset] duration-500"
        />
      </svg>
    </section>
  );
}

function ExerciseCard({ assignment: a }: { assignment: WithId<Assignment> }) {
  const setStatus = useSetAssignmentStatus();
  const materials = useMaterialsByIds(a.materialIds ?? []);
  const now = useNow();
  const due = toDate(a.dueDate);
  const overdue = due && a.status !== "completed" && due.getTime() < now;

  return (
    <article className={cn("card-surface space-y-4 p-4", a.status === "completed" && "opacity-90")}>
      <div className="space-y-1">
        <AssignmentBadge status={a.status} />
        <h2 className="pt-1 text-lg leading-snug font-semibold">{a.title}</h2>
        {a.description && <Markdown className="text-muted-foreground">{a.description}</Markdown>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarCheck className="size-4" aria-hidden /> Assegnato: {formatDate(a.assignedAt, "d MMMM")}
        </span>
        {due && (
          <span className={cn("flex items-center gap-1", overdue && "font-semibold text-danger")}>
            <CalendarX2 className="size-4" aria-hidden /> Scadenza: {formatDate(due, "d MMMM")}
          </span>
        )}
      </div>
      {!!materials.data?.length && (
        <div className="space-y-2">
          {materials.data.map((m) => (
            <MaterialRow key={m.id} material={m} />
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground" id={`st-${a.id}`}>
          Stato di avanzamento
        </p>
        <div role="radiogroup" aria-labelledby={`st-${a.id}`} className="flex gap-1 rounded-xl bg-surface-mid p-1">
          {ORDER.map((s) => {
            const active = a.status === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={setStatus.isPending}
                onClick={() => !active && setStatus.mutate({ id: a.id, status: s })}
                className={cn(
                  "min-h-11 flex-1 rounded-lg text-[13px] font-semibold transition-all",
                  active ? "bg-card text-brand-ink shadow-card" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && <span aria-hidden>✓ </span>}
                {ASSIGNMENT_META[s].label}
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}
