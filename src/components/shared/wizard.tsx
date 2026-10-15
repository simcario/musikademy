"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Barra dei passi di un wizard: segmenti pieni fino al passo corrente. */
export function WizardProgress({ steps, index }: { steps: string[]; index: number }) {
  return (
    <div className="space-y-2">
      <ol className="flex gap-1.5" aria-hidden>
        {steps.map((s, i) => (
          <li key={s} className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-surface-highest")} />
        ))}
      </ol>
      <p className="section-label" aria-live="polite">
        Passo {index + 1} di {steps.length} · {steps[index]}
      </p>
    </div>
  );
}

/** Piede del wizard: Annulla/Indietro e Avanti; all'ultimo passo il pulsante d'invio. Avanti e invio sono `submit` del form. */
export function WizardActions({
  index,
  last,
  submitting,
  submitLabel,
  onBack,
  onCancel,
}: {
  index: number;
  last: boolean;
  submitting: boolean;
  submitLabel: string;
  onBack: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-between gap-2 border-t border-border bg-popover px-5 py-3">
      <Button type="button" variant="outline" disabled={submitting} onClick={index === 0 ? onCancel : onBack}>
        {index === 0 ? (
          "Annulla"
        ) : (
          <>
            <ArrowLeft aria-hidden /> Indietro
          </>
        )}
      </Button>
      <Button type="submit" disabled={submitting}>
        {last ? (
          <>
            {submitting && <Loader2 className="animate-spin" aria-hidden />}
            {submitLabel}
          </>
        ) : (
          <>
            Avanti <ArrowRight aria-hidden />
          </>
        )}
      </Button>
    </div>
  );
}
