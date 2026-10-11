"use client";

import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/shared/status-badge";
import type { InteractiveExercise } from "@/types";
import { InteractiveIcon } from "./catalog";
import { IntervalsGame } from "./intervals-game";
import { MeasureGame } from "./measure-game";
import { MicSetup } from "./mic-setup";
import { PianoKeysGame } from "./piano-keys-game";
import { ScalesGame } from "./scales-game";
import { StaffNotesGame } from "./staff-notes-game";
import { useMicrophone } from "./use-microphone";

/** Contrassegno degli esercizi interattivi in elenchi e card. */
export function InteractiveBadge({ className }: { className?: string }) {
  return (
    <Pill tone="secondary" className={className}>
      <InteractiveIcon className="size-3.5" aria-hidden /> Interattivo
    </Pill>
  );
}

export interface InteractiveSession {
  title: string;
  exercise: InteractiveExercise;
}

/** Finestra di gioco: chiudendola il microfono viene rilasciato. */
export function InteractivePlayerDialog({
  session,
  onClose,
  onComplete,
}: {
  session: InteractiveSession | null;
  onClose: () => void;
  onComplete?: () => void;
}) {
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 shadow-dialog sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 pt-5 pb-4">
          <DialogTitle className="pr-8 text-lg leading-snug font-semibold">{session?.title}</DialogTitle>
          <DialogDescription>Esercizio interattivo con il microfono</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4">
          {session && <InteractivePlayer exercise={session.exercise} onClose={onClose} onComplete={onComplete} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InteractivePlayer({
  exercise,
  onClose,
  onComplete,
}: {
  exercise: InteractiveExercise;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const mic = useMicrophone();

  if (mic.status === "checking") {
    return (
      <p className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Preparo il microfono…
      </p>
    );
  }
  if (mic.status === "setup" || !mic.stream) return <MicSetup mic={mic} />;

  const game = { stream: mic.stream, onClose, onComplete };
  return (
    <div className="space-y-3">
      {exercise.kind === "piano-keys" && <PianoKeysGame exercise={exercise} {...game} />}
      {exercise.kind === "scales" && <ScalesGame exercise={exercise} {...game} />}
      {exercise.kind === "staff-notes" && <StaffNotesGame exercise={exercise} {...game} />}
      {exercise.kind === "staff-measure" && <MeasureGame exercise={exercise} {...game} />}
      {exercise.kind === "intervals" && <IntervalsGame exercise={exercise} {...game} />}
      <Button variant="ghost" size="sm" onClick={mic.reconfigure} className="text-muted-foreground">
        <Settings2 aria-hidden /> Cambia microfono
      </Button>
    </div>
  );
}
