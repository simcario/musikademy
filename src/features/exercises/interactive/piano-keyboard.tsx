import { cn } from "@/lib/utils";
import { WHITE_KEYS } from "./pitch";

const KEY_WIDTH = 20;
/** Tasti neri: classe di altezza e tasto bianco alla cui destra si trovano. */
const BLACK_KEYS = [
  { pitchClass: 1, after: 0 },
  { pitchClass: 3, after: 1 },
  { pitchClass: 6, after: 3 },
  { pitchClass: 8, after: 4 },
  { pitchClass: 10, after: 5 },
];

/** Un'ottava di tastiera (Do–Si) che evidenzia la nota corretta e quella suonata per errore. */
export function PianoKeyboard({ correct, wrong, className }: { correct?: number | null; wrong?: number | null; className?: string }) {
  const tone = (pitchClass: number) => (pitchClass === correct ? "fill-success" : pitchClass === wrong ? "fill-danger" : null);
  return (
    <svg viewBox="0 0 140 72" className={cn("w-full", className)} aria-hidden>
      {WHITE_KEYS.map((pitchClass, i) => (
        <rect
          key={pitchClass}
          x={i * KEY_WIDTH + 0.5}
          y={0.5}
          width={KEY_WIDTH - 1}
          height={71}
          rx={2.5}
          className={cn("stroke-border", tone(pitchClass) ?? "fill-card")}
        />
      ))}
      {BLACK_KEYS.map(({ pitchClass, after }) => (
        <rect
          key={pitchClass}
          x={(after + 1) * KEY_WIDTH - 6}
          y={0.5}
          width={12}
          height={44}
          rx={2}
          className={cn("stroke-foreground", tone(pitchClass) ?? "fill-foreground")}
        />
      ))}
    </svg>
  );
}
