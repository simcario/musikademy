"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { LessonFormDialog } from "@/features/lessons/lesson-form";
import { StaffLessonList } from "@/features/lessons/lesson-list";
import { useLesson } from "@/features/student-area/hooks";

export default function AdminLessonsPage() {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Lezioni" description="Crea, modifica o annulla le lezioni. Le presenze si registrano dal registro." />
      <StaffLessonList />
      <Suspense>
        <EditFromUrl />
      </Suspense>
    </PageContainer>
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
