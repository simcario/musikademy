import type { LucideIcon } from "lucide-react";
import { ArrowUpDown, AudioLines, Ear, Gamepad2, ListMusic, Music, Piano, Timer, TrendingUp } from "lucide-react";
import { DEFAULT_CHORDS } from "./chords";
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
  /** Esercizio d'ascolto: si risponde toccando lo schermo, il microfono non serve. */
  listening?: boolean;
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
      "Compare una battuta in 4/4 della difficoltà scelta: lo studente la suona a tempo con il metronomo incorporato, oppure senza metronomo per esercitare solo la lettura. Si assegna con una procedura guidata.",
    instructions: `${SETUP} Compare una battuta: leggila e suonala, una nota dopo l'altra. Se l'esercizio prevede il **metronomo**, premi **Avvia**: conta alla rovescia una battuta (4-3-2-1), poi suonala a tempo.`,
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
  {
    kind: "chord-timing",
    title: "Accordi a tempo",
    summary:
      "Lo studente suona gli accordi scelti sul metronomo, cambiando accordo ogni 4, 2 o 1 battito. Il microfono misura quanto ogni attacco è preciso e una barra mostra la precisione. Scegli complessità, accordi e velocità con la procedura guidata.",
    instructions: `${SETUP} Il metronomo conta una battuta (4-3-2-1), poi suona gli accordi che compaiono, attaccando ogni nuovo accordo **esattamente sul clic**. La barra mostra la tua precisione. Con le cuffie la misura è più precisa.`,
    icon: Timer,
    defaults: { kind: "chord-timing", complexity: "easy", chords: DEFAULT_CHORDS, order: "sequence", beatsPerChord: 4, bpm: 72, changes: 16 },
    wizard: true,
  },
  {
    kind: "ear-notes",
    title: "Indovina la nota",
    summary:
      "Il sistema suona le prime cinque note di una scala e poi una di esse: lo studente indovina quale ha sentito. Esercizio d'ascolto, non serve il microfono.",
    instructions: "Ascolta le prime **cinque note** della scala, poi una di esse: scegli quale hai sentito. Puoi riascoltare quante volte vuoi. Meglio con le cuffie.",
    icon: Ear,
    defaults: { kind: "ear-notes", scale: "major", tonic: "fixed", rounds: 10 },
    listening: true,
  },
  {
    kind: "ear-progressions",
    title: "Indovina la progressione",
    summary:
      "Il sistema suona una progressione di accordi e ne propone quattro: lo studente sceglie quella che ha sentito. Esercizio d'ascolto, non serve il microfono.",
    instructions: "Ascolta la progressione di accordi, poi scegli quella giusta tra le **quattro proposte**. Dopo la risposta puoi ascoltare anche le altre. Meglio con le cuffie.",
    icon: AudioLines,
    defaults: { kind: "ear-progressions", level: "basic", length: 4, key: "fixed", rounds: 8 },
    listening: true,
  },
];

export function catalogEntry(kind: InteractiveKind) {
  return INTERACTIVE_CATALOG.find((e) => e.kind === kind);
}
