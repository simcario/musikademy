"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { Segmented } from "@/components/shared/segmented";
import { LessonCalendar } from "@/features/lessons/lesson-calendar";
import { LessonFormDialog } from "@/features/lessons/lesson-form";
import { StaffLessonList } from "@/features/lessons/lesson-list";
import { useLesson } from "@/features/student-area/hooks";

export default function AdminLessonsPage() {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Lezioni" description="Crea, modifica o annulla le lezioni. Le presenze si registrano dal registro." />
      <Suspense>
        <LessonsView />
        <EditFromUrl />
      </Suspense>
    </PageContainer>
  );
}

type View = "list" | "calendar";

/** Elenco o calendario: la scelta resta nell'URL (?view=calendar). */
function LessonsView() {
  const params = useSearchParams();
  const router = useRouter();
  const view: View = params.get("view") === "calendar" ? "calendar" : "list";
  return (
    <>
      <Segmented
        label="Vista lezioni"
        value={view}
        onChange={(v) => router.replace(v === "calendar" ? "/admin/lessons?view=calendar" : "/admin/lessons", { scroll: false })}
        options={[
          { value: "list", label: "Elenco" },
          { value: "calendar", label: "Calendario" },
        ]}
        className="sm:w-72"
      />
      {view === "calendar" ? <LessonCalendar /> : <StaffLessonList />}
    </>
  );
}

/** Apertura diretta dalla ricerca globale: /admin/lessons?edit=<id> */
function EditFromUrl() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("edit");
  const lesson = useLesson(id ?? "");
  if (!id || !lesson.data) return null;
  return <LessonFormDialog open onOpenChange={(o) => !o && router.replace("/admin/lessons")} lesson={lesson.data} />;
}
