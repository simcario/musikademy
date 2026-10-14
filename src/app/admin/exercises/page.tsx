"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { TabBar } from "@/components/shared/segmented";
import { InteractiveIcon } from "@/features/exercises/interactive/catalog";
import { InteractiveCatalog } from "@/features/exercises/interactive/interactive-catalog";
import { MaterialExerciseCatalog } from "@/features/exercises/material-exercise-catalog";

type Tab = "interactive" | "material";

export default function AdminExercisesPage() {
  return (
    <Suspense>
      <Exercises />
    </Suspense>
  );
}

function Exercises() {
  const router = useRouter();
  const tab: Tab = useSearchParams().get("tab") === "material" ? "material" : "interactive";

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Esercizi"
        description="Catalogo degli esercizi da assegnare. Quelli già assegnati si trovano nella scheda di ogni studente, sezione Esercizi."
      />
      <TabBar<Tab>
        label="Tipo di esercizio"
        value={tab}
        onChange={(t) => router.replace(t === "material" ? "/admin/exercises?tab=material" : "/admin/exercises", { scroll: false })}
        options={[
          { value: "interactive", label: "Interattivi", icon: InteractiveIcon },
          { value: "material", label: "Con materiale", icon: FileText },
        ]}
      />
      {tab === "interactive" ? <InteractiveCatalog /> : <MaterialExerciseCatalog />}
    </PageContainer>
  );
}
