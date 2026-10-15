"use client";

import { GraduationCap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useActiveStudents, useGroups } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { useCourses } from "@/features/student-area/hooks";
import { can } from "@/lib/auth/roles";
import { CourseForm } from "./course-form";
import { NO_COURSE, TABLE_HEAD, rowClass, usePanel } from "./panel";

/**
 * Scheda "Corsi" della sezione Organizzazione: elenco dei corsi; il dettaglio (gruppi, studenti, dati)
 * si apre nel pannello laterale. `creating` è pilotato dalla pagina, che ha il pulsante "Nuovo corso".
 */
export function CoursesTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (o: boolean) => void }) {
  const { access } = useSession();
  const editable = can(access, "settings:manage");
  const panel = usePanel();
  const courses = useCourses();
  const groups = useGroups();
  const students = useActiveStudents();

  if (courses.isPending) return <ListSkeleton rows={3} />;
  if (courses.isError) return <ErrorState error={courses.error} onRetry={() => courses.refetch()} />;

  const courseIds = new Set(courses.data.map((c) => c.id));
  const allGroups = groups.data ?? [];
  const allStudents = students.data ?? [];
  // Gruppi creati prima dei corsi e studenti non ancora iscritti: restano raggiungibili da "Senza corso".
  const looseGroups = allGroups.filter((g) => !g.courseId || !courseIds.has(g.courseId)).length;
  const looseStudents = allStudents.filter((s) => !s.courseIds.some((c) => courseIds.has(c))).length;
  const loading = groups.isPending || students.isPending;
  const rows = [
    ...[...courses.data]
      .sort((a, b) => Number(b.active) - Number(a.active))
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        inactive: !c.active,
        groups: allGroups.filter((g) => g.courseId === c.id).length,
        students: allStudents.filter((s) => s.courseIds.includes(c.id)).length,
      })),
    ...(looseGroups || looseStudents
      ? [{ id: NO_COURSE, name: "Senza corso", description: undefined, inactive: false, groups: looseGroups, students: looseStudents }]
      : []),
  ];

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nessun corso"
          description="Crea un corso per organizzare gruppi e studenti. Uno studente può frequentare più corsi."
          action={
            editable && (
              <Button onClick={() => onCreatingChange(true)}>
                <Plus aria-hidden /> Crea il primo corso
              </Button>
            )
          }
        />
      ) : (
        <div className="card-surface @container overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className={TABLE_HEAD}>
              <tr>
                <th className="px-4 py-3">Corso</th>
                <th className="px-4 py-3">Gruppi</th>
                <th className="px-4 py-3">Studenti</th>
                <th className="px-4 py-3">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => {
                const selected = panel.selected("course", c.id);
                return (
                  <tr key={c.id} onClick={() => panel.show("course", c.id)} aria-selected={selected} className={rowClass(selected)}>
                    <td className="px-4 py-3">
                      <button type="button" className="block max-w-full truncate text-left font-semibold">
                        {c.name}
                      </button>
                      {c.description && <span className="block truncate text-xs text-muted-foreground">{c.description}</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{loading ? "…" : c.groups}</td>
                    <td className="px-4 py-3 tabular-nums">{loading ? "…" : c.students}</td>
                    <td className="px-4 py-3">
                      {c.id !== NO_COURSE && (
                        <Pill tone={c.inactive ? "neutral" : "success"} dot>
                          {c.inactive ? "Non attivo" : "Attivo"}
                        </Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SidePanel open={creating} onOpenChange={onCreatingChange} title="Nuovo corso">
        {creating && <CourseForm course={null} onDone={() => onCreatingChange(false)} onCancel={() => onCreatingChange(false)} />}
      </SidePanel>
    </>
  );
}
