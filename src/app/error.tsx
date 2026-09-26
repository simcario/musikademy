"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Error boundary: nessun dettaglio tecnico all'utente (§45). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
      <AlertTriangle className="size-10 text-warning" aria-hidden />
      <h1 className="text-xl font-semibold">Qualcosa è andato storto</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Si è verificato un errore imprevisto. Riprova tra un istante.</p>
      <Button onClick={reset}>Riprova</Button>
    </main>
  );
}
