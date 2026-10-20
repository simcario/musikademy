"use client";

import { useState } from "react";
import { ChevronRight, GraduationCap, Info, Plus, UserCog, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/brand";
import { SidePanel } from "@/components/shared/dialogs";
import { TabBar } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useActiveStudents, useGroups } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { useCourses, useTeachers } from "@/features/student-area/hooks";
import { can } from "@/lib/auth/roles";
import type { Course, WithId } from "@/types";
import { byName, fullName, sortName } from "@/utils/format";
import { CourseForm, CourseStudentsForm } from "./course-form";
import { GroupForm, GroupList } from "./group-list";
import { NO_COURSE, PanelBody, PanelHeader, usePanel } from "./panel";

type Tab = "students" | "groups" | "details";

/** Livello "corso" del pannello: studenti, gruppi e dati del corso. `NO_COURSE` = ciò che non ha un corso. */
export function CoursePanel({ courseId, tab: tabParam }: { courseId: string; tab?: string }) {
  const panel = usePanel();
  const courses = useCourses();
  const groupsQ = useGroups();
  const studentsQ = useActiveStudents();
  const [addingGroup, setAddingGroup] = useState(false);
  const [managing, setManaging] = useState(false);

  const loose = courseId === NO_COURSE;
  const course = courses.data?.find((c) => c.id === courseId) ?? null;
  if (!course && !loose) {
    return (
      <>
        <PanelHeader title="Corso" />
        <PanelBody>
          {courses.isPending ? (
            <ListSkeleton rows={3} />
          ) : courses.isError ? (
            <ErrorState error={courses.error} onRetry={() => courses.refetch()} />
          ) : (
            <EmptyState title="Corso non trovato" />
          )}
        </PanelBody>
      </>
    );
  }

  const known = new Set((courses.data ?? []).map((c) => c.id));
  const groups = (groupsQ.data ?? []).filter((g) => (loose ? !g.courseId || !known.has(g.courseId) : g.courseId === courseId));
  const students = (studentsQ.data ?? [])
    .filter((s) => (loose ? !s.courseIds.some((c) => known.has(c)) : s.courseIds.includes(courseId)))
    .sort(byName);
  const tab: Tab = tabParam === "groups" || (tabParam === "details" && !loose) ? tabParam : "students";

  return (
    <>
      <PanelHeader
        title={course?.name ?? "Senza corso"}
        description={course ? course.description : "Gruppi e studenti non ancora collegati a un corso"}
        badges={course && !course.active && <Pill tone="neutral">Non attivo</Pill>}
      />
      <PanelBody>
        <TabBar<Tab>
          label="Sezioni corso"
          value={tab}
          onChange={panel.setTab}
          options={[
            { value: "students", label: "Studenti", icon: GraduationCap, count: students.length },
            { value: "groups", label: "Gruppi", icon: UsersRound, count: groups.length },
            ...(loose ? [] : [{ value: "details" as const, label: "Dettagli", icon: Info }]),
          ]}
        />

        {tab === "students" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {loose ? "Per iscriverli apri un corso e usa «Gestisci»." : "Studenti iscritti al corso."}
              </p>
              {course && (
                <Button onClick={() => setManaging(true)} className="shrink-0">
                  <UserCog aria-hidden /> Gestisci
                </Button>
              )}
            </div>
            {studentsQ.isPending ? (
              <ListSkeleton rows={3} />
            ) : students.length === 0 ? (
              <EmptyState title={loose ? "Nessuno studente senza corso" : "Nessuno studente iscritto"} />
            ) : (
              <ul className="card-surface divide-y divide-border">
                {students.map((s) => {
                  const inGroups = groups.filter((g) => s.groupIds?.includes(g.id)).map((g) => g.name);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => panel.open("user", s.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                      >
                        <UserAvatar person={s} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{sortName(s)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {inGroups.length ? inGroups.join(" · ") : s.email}
                          </span>
                        </span>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === "groups" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {loose
                  ? "Apri un gruppo per scegliere il suo corso."
                  : "A un gruppo si assegnano materiali e cartelle per più studenti insieme."}
              </p>
              {course && (
                <Button onClick={() => setAddingGroup(true)} className="shrink-0">
                  <Plus aria-hidden /> Nuovo gruppo
                </Button>
              )}
            </div>
            {groupsQ.isPending ? (
              <ListSkeleton rows={2} />
            ) : groups.length === 0 ? (
              <EmptyState title="Nessun gruppo" />
            ) : (
              <GroupList groups={groups} onOpen={(g) => panel.open("group", g.id)} />
            )}
          </div>
        )}

        {tab === "details" && course && <CourseDetails course={course} />}
      </PanelBody>

      {course && (
        <>
          <SidePanel open={addingGroup} onOpenChange={setAddingGroup} title="Nuovo gruppo" description={course.name}>
            {addingGroup && <GroupForm group={null} courseId={course.id} onDone={() => setAddingGroup(false)} />}
          </SidePanel>
          <SidePanel open={managing} onOpenChange={setManaging} title="Studenti del corso" description={course.name}>
            {managing && (
              <CourseStudentsForm
                course={course}
                enrolled={students.map((s) => s.id)}
                groupIds={groups.map((g) => g.id)}
                onDone={() => setManaging(false)}
              />
            )}
          </SidePanel>
        </>
      )}
    </>
  );
}

/** Dati del corso: modificabili dall'amministratore, in sola lettura per i docenti. */
function CourseDetails({ course }: { course: WithId<Course> }) {
  const { access } = useSession();
  const teachers = useTeachers();
  // "Annulla" fa ripartire il form dai dati salvati.
  const [version, setVersion] = useState(0);

  if (can(access, "settings:manage")) {
    return <CourseForm key={version} course={course} onDone={() => undefined} onCancel={() => setVersion((v) => v + 1)} />;
  }

  const names = (teachers.data ?? []).filter((t) => course.teacherIds.includes(t.id)).map(fullName);
  return (
    <dl className="card-surface space-y-3 p-4 text-sm">
      <div>
        <dt className="text-xs font-semibold text-muted-foreground">Descrizione</dt>
        <dd>{course.description || "—"}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold text-muted-foreground">Docenti</dt>
        <dd>{names.length ? names.join(", ") : "—"}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold text-muted-foreground">Materie</dt>
        <dd>
          {course.subjects?.length ? (
            <ul className="space-y-0.5">
              {course.subjects.map((s) => {
                const by = (teachers.data ?? []).filter((t) => s.teacherIds.includes(t.id)).map(fullName);
                return (
                  <li key={s.id}>
                    <span className="font-medium">{s.name}</span>
                    {by.length > 0 && <span className="text-muted-foreground"> · {by.join(", ")}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold text-muted-foreground">Stato</dt>
        <dd>{course.active ? "Attivo" : "Non attivo"}</dd>
      </div>
      <p className="text-xs text-muted-foreground">I dati del corso li modifica l&apos;amministratore.</p>
    </dl>
  );
}
