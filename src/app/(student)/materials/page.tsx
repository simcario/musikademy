"use client";

import { PageContainer, PageHeader } from "@/components/shared/page";
import { StudentLibrary } from "@/features/materials/student-library";

export default function MaterialsPage() {
  return (
    <PageContainer>
      <PageHeader title="Materiali" description="Dispense, spartiti, basi e video assegnati a te." />
      <StudentLibrary />
    </PageContainer>
  );
}
