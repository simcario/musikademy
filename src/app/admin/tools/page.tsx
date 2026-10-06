"use client";

import { PageContainer, PageHeader } from "@/components/shared/page";
import { Metronome } from "@/features/tools/metronome";

export default function AdminToolsPage() {
  return (
    <PageContainer>
      <PageHeader title="Strumenti" description="Strumenti utili durante le lezioni." />
      <Metronome />
    </PageContainer>
  );
}
