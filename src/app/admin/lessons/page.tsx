"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, List } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { Segmented } from "@/components/shared/segmented";
import { LessonCalendar } from "@/features/lessons/lesson-calendar";
import { LessonFormDialog } from "@/features/lessons/lesson-form";
import { StaffLessonList } from "@/features/lessons/lesson-list";
import { useLesson } from "@/features/student-area/hooks";

export default function AdminLessonsPage() {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Lezioni" description="Crea, modifica o annulla le lezioni. Registra le presenze dal tasto accanto a ogni lezione." />
      <Suspense>
        <LessonsView />
        <EditFromUrl />
      </Suspense>
    </PageContainer>
  );
}

type View = "list" | "calendar";

/** Calendario (default) o elenco: la scelta resta nell'URL (?view=list). */
function LessonsView() {
  const params = useSearchParams();
  const router = useRouter();
  const view: View = params.get("view") === "list" ? "list" : "calendar";
  const toggle = (
    <Segmented
      label="Vista lezioni"
      value={view}
      onChange={(v) => router.replace(v === "list" ? "/admin/lessons?view=list" : "/admin/lessons", { scroll: false })}
      options={[
        { value: "calendar", label: "Calendario", icon: CalendarDays },
        { value: "list", label: "Elenco", icon: List },
      ]}
      className="w-24 shrink-0"
    />
  );
  return view === "calendar" ? <LessonCalendar toolbar={toggle} /> : <StaffLessonList toolbar={toggle} />;
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
