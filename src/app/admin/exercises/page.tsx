"use client";

import { PageContainer, PageHeader } from "@/components/shared/page";
import { StaffAssignmentList } from "@/features/exercises/assignment-list";

export default function AdminExercisesPage() {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Esercizi" description="Assegna esercizi e segui lo stato di avanzamento degli studenti." />
      <StaffAssignmentList />
    </PageContainer>
  );
}
