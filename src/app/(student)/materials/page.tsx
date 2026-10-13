"use client";

import { PageContainer } from "@/components/shared/page";
import { StudentLibrary } from "@/features/materials/student-library";

export default function MaterialsPage() {
  return (
    <PageContainer>
      {/* Niente intestazione visibile: lo spazio va all'elenco. Il titolo resta per gli screen reader. */}
      <h1 className="sr-only">Materiali</h1>
      <StudentLibrary />
    </PageContainer>
  );
}
