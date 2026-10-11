"use client";

import { useState } from "react";
import { Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssignmentFormDialog } from "../assignment-form";
import { INTERACTIVE_CATALOG, type InteractiveCatalogEntry } from "./catalog";
import { InteractiveBadge, InteractivePlayerDialog } from "./interactive-player";
import { InteractiveWizardDialog } from "./interactive-wizard";

/** Catalogo docente degli esercizi interattivi: ogni voce si può provare e assegnare agli studenti. */
export function InteractiveCatalog() {
  const [trying, setTrying] = useState<InteractiveCatalogEntry | null>(null);
  const [assigning, setAssigning] = useState<InteractiveCatalogEntry | null>(null);

  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {INTERACTIVE_CATALOG.map((entry) => (
          <li key={entry.kind} className="card-surface flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-soft text-violet-ink">
                <entry.icon className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <InteractiveBadge />
                <h2 className="leading-snug font-semibold">{entry.title}</h2>
              </div>
            </div>
            <p className="flex-1 text-sm text-muted-foreground">{entry.summary}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setTrying(entry)}>
                <Play aria-hidden /> Prova
              </Button>
              <Button onClick={() => setAssigning(entry)}>
                <Plus aria-hidden /> Assegna
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <InteractivePlayerDialog
        session={trying && { title: trying.title, exercise: trying.defaults }}
        onClose={() => setTrying(null)}
      />
      <AssignmentFormDialog
        open={!!assigning && !assigning.wizard}
        onOpenChange={(o) => !o && setAssigning(null)}
        defaults={assigning ? { title: assigning.title, description: assigning.instructions, interactive: assigning.defaults } : undefined}
      />
      <InteractiveWizardDialog entry={assigning?.wizard ? assigning : null} onClose={() => setAssigning(null)} />
    </>
  );
}
