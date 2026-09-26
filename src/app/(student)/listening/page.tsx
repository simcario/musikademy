"use client";

import { PageContainer, PageHeader } from "@/components/shared/page";
import { StudentLibrary } from "@/features/materials/student-library";

export default function ListeningPage() {
  return (
    <PageContainer>
      <PageHeader title="Ascolti" description="Tracce guida e basi per lo studio quotidiano." />
      <StudentLibrary categories={["ascolto", "base"]} />
    </PageContainer>
  );
}
