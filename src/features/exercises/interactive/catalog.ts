import type { LucideIcon } from "lucide-react";
import { ArrowUpDown, Gamepad2, ListMusic, Music, Piano, TrendingUp } from "lucide-react";
import type { InteractiveExercise, InteractiveKind } from "@/types";

/** Icona che contraddistingue ovunque un esercizio interattivo. */
export const InteractiveIcon = Gamepad2;

export interface InteractiveCatalogEntry {
  kind: InteractiveKind;
  title: string;
  /** Presentazione nel catalogo docente. */
  summary: string;
  /** Istruzioni proposte allo studente (Markdown), modificabili in fase di assegnazione. */
  instructions: string;
  icon: LucideIcon;
  /** Impostazioni proposte in fase di assegnazione e usate da "Prova". */
  defaults: InteractiveExercise;
  /** L'assegnazione avviene con la procedura guidata, un passo per ogni scelta. */
  wizard?: boolean;
}

const SETUP = "Tieni il dispositivo vicino al pianoforte.";

/**
 * Catalogo degli esercizi interattivi. Per aggiungerne uno: il tipo in `types`, una voce qui,
 * le sue impostazioni in `interactive-settings` e il gioco in `interactive-player`.
 */
export const INTERACTIVE_CATALOG: InteractiveCatalogEntry[] = [
  {
    kind: "piano-keys",
    title: "Riconoscimento della tastiera del pianoforte",
    summary:
      "Dopo un 3-2-1 compare una nota a caso: lo studente ha 5 secondi per suonarla sul proprio strumento. La risposta è riconosciuta dal microfono.",
    instructions: `${SETUP} Dopo il **3-2-1** compare il nome di una nota: suonala entro **5 secondi**, in qualunque ottava.`,
    icon: Piano,
    defaults: { kind: "piano-keys", rounds: 10, accidentals: false },
  },
  {
    kind: "scales",
    title: "Le scale musicali",
    summary:
      "Compare il nome di una scala: lo studente la suona ascendente per un'ottava, con o senza limite di tempo. Scegli il tipo di scala (maggiore, minore…) o misto.",
    instructions: `${SETUP} Dopo il **3-2-1** compare il nome di una scala: suonala in senso ascendente per un'ottava, dalla tonica alla tonica, una nota alla volta.`,
    icon: TrendingUp,
    defaults: { kind: "scales", scale: "major", rounds: 5, accidentals: false, timeLimit: 30 },
  },
  {
    kind: "staff-notes",
    title: "Indovina la nota sul pentagramma",
    summary:
      "Sul pentagramma compare una nota nella chiave scelta: lo studente la legge e la suona, con o senza limite di tempo. Si assegna con una procedura guidata.",
    instructions: `${SETUP} Dopo il **3-2-1** compare una nota sul pentagramma: leggila e suonala sulla tastiera.`,
    icon: Music,
    defaults: { kind: "staff-notes", clef: "treble", range: "staff", accidentals: false, strictOctave: false, rounds: 10, timeLimit: 10 },
    wizard: true,
  },
  {
    kind: "staff-measure",
    title: "Suona la battuta",
    summary:
      "Compare una battuta in 4/4 della difficoltà scelta: lo studente la suona a tempo con il metronomo incorporato. Si assegna con una procedura guidata.",
    instructions: `${SETUP} Compare una battuta: il **metronomo** batte quattro quarti a vuoto, poi suonala a tempo, una nota dopo l'altra.`,
    icon: ListMusic,
    defaults: { kind: "staff-measure", clef: "treble", difficulty: "easy", bpm: 60, rounds: 5 },
    wizard: true,
  },
  {
    kind: "intervals",
    title: "Gli intervalli",
    summary:
      "Compaiono una nota di partenza e un intervallo: lo studente suona la nota di arrivo. Per esempio, per una 3ª maggiore sopra Do deve suonare Mi.",
    instructions: `${SETUP} Dopo il **3-2-1** compaiono una nota di partenza e un intervallo: suona la nota di arrivo, in qualunque ottava.`,
    icon: ArrowUpDown,
    defaults: { kind: "intervals", level: "seconds_thirds", direction: "up", accidentals: false, rounds: 10, timeLimit: 15 },
  },
];

export function catalogEntry(kind: InteractiveKind) {
  return INTERACTIVE_CATALOG.find((e) => e.kind === kind);
}
