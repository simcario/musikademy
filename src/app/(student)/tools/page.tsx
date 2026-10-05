"use client";

import { PageContainer, PageHeader } from "@/components/shared/page";
import { Metronome } from "@/features/tools/metronome";

export default function ToolsPage() {
  return (
    <PageContainer>
      <PageHeader title="Strumenti" description="Strumenti utili per lo studio quotidiano." />
      <Metronome />
    </PageContainer>
  );
}
