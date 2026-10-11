"use client";

import { PageContainer, PageHeader } from "@/components/shared/page";
import { InteractiveCatalog } from "@/features/exercises/interactive/interactive-catalog";
import { MaterialExerciseCatalog } from "@/features/exercises/material-exercise-catalog";

export default function AdminExercisesPage() {
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Esercizi"
        description="Catalogo degli esercizi da assegnare. Quelli già assegnati si trovano nella scheda di ogni studente, sezione Esercizi."
      />
      <section className="space-y-3" aria-labelledby="interactive-exercises">
        <h2 id="interactive-exercises" className="section-label">
          Esercizi interattivi
        </h2>
        <InteractiveCatalog />
      </section>
      <MaterialExerciseCatalog />
    </PageContainer>
  );
}
