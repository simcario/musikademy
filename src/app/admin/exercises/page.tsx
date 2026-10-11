"use client";

import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { Segmented } from "@/components/shared/segmented";
import { StaffAssignmentList } from "@/features/exercises/assignment-list";
import { InteractiveCatalog } from "@/features/exercises/interactive/interactive-catalog";

type Section = "assigned" | "interactive";

export default function AdminExercisesPage() {
  const [section, setSection] = useState<Section>("assigned");
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Esercizi" description="Assegna esercizi e segui lo stato di avanzamento degli studenti." />
      <Segmented
        label="Sezione esercizi"
        value={section}
        onChange={setSection}
        className="max-w-md"
        options={[
          { value: "assigned", label: "Assegnati" },
          { value: "interactive", label: "Esercizi interattivi" },
        ]}
      />
      {section === "assigned" ? <StaffAssignmentList /> : <InteractiveCatalog onAssigned={() => setSection("assigned")} />}
    </PageContainer>
  );
}
