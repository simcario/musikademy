import { cn } from "@/lib/utils";
import type { Clef } from "@/types";
import { ALTERATION } from "./pitch";
import { BEATS_PER_MEASURE, CLEF_LABEL, staffPosition, type StaffNote } from "./staff";

export interface StaffItem {
  note: StaffNote;
  /** Durata in quarti: 4 semibreve, 2 minima, 1 semiminima, 0.5 croma. */
  beats: number;
  /** Quarto su cui cade la nota: decide la posizione orizzontale. Senza, la nota è centrata. */
  start?: number;
  tone?: "done" | "wrong";
}

/** Distanza tra due righe; la quinta riga (in alto) è a y = 30, la prima a y = 70. */
const GAP = 10;
const BOTTOM_Y = 70;
const LINES = [30, 40, 50, 60, 70];
const STEM = 30;
const HEAD_RX = 6;

const yOf = (position: number) => BOTTOM_Y - (position * GAP) / 2;

/** Tagli addizionali sotto la prima riga o sopra la quinta, fino alla nota. */
function ledgerLines(position: number) {
  const lines: number[] = [];
  for (let p = -2; p >= position; p -= 2) lines.push(p);
  for (let p = 10; p <= position; p += 2) lines.push(p);
  return lines;
}

const CLEF_PATH: Record<Clef, string> = {
  treble:
    "M 23 63 c -3 1 -6 -2 -5 -6 c 1 -4 7 -6 11 -2 c 5 5 3 13 -4 15 c -8 2 -15 -4 -15 -12 c 0 -8 6 -13 11 -19 c 5 -6 8 -12 6 -19 c -1 -5 -5 -5 -7 0 c -2 5 -1 10 0 16 l 6 37 c 1 6 -2 10 -7 10 c -4 0 -6 -3 -5 -6",
  bass: "M 13 41 c -1 -7 4 -11 10 -11 c 8 0 12 6 12 13 c 0 12 -10 21 -23 27",
};

function Note({ item, clef, x }: { item: StaffItem; clef: Clef; x: number }) {
  const position = staffPosition(item.note, clef);
  const y = yOf(position);
  const hollow = item.beats >= 2;
  const up = position < 4;
  const stemX = up ? x + HEAD_RX - 0.6 : x - HEAD_RX + 0.6;
  const stemEnd = up ? y - STEM : y + STEM;
  return (
    <g className={cn(item.tone === "done" && "text-success", item.tone === "wrong" && "text-danger")} stroke="currentColor" fill="currentColor">
      {ledgerLines(position).map((p) => (
        <line key={p} x1={x - 11} x2={x + 11} y1={yOf(p)} y2={yOf(p)} strokeWidth={1} />
      ))}
      {item.note.alter !== 0 && (
        <text x={x - 17} y={y + 6} fontSize={18} textAnchor="middle" stroke="none">
          {ALTERATION[item.note.alter]}
        </text>
      )}
      <ellipse
        cx={x}
        cy={y}
        rx={hollow ? HEAD_RX - 0.5 : HEAD_RX}
        ry={hollow ? 3.8 : 4.4}
        transform={`rotate(-20 ${x} ${y})`}
        fill={hollow ? "none" : "currentColor"}
        strokeWidth={hollow ? 2 : 0}
      />
      {item.beats < 4 && <line x1={stemX} x2={stemX} y1={y + (up ? -1.5 : 1.5)} y2={stemEnd} strokeWidth={1.4} />}
      {item.beats < 1 && (
        <path
          d={up ? `M ${stemX} ${stemEnd} c 1 7 9 8 6 18` : `M ${stemX} ${stemEnd} c 1 -7 9 -8 6 -18`}
          fill="none"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** Pentagramma con chiave e note; con `timeSignature` le note si dispongono lungo una battuta in 4/4. */
export function StaffView({
  clef,
  items,
  timeSignature,
  className,
}: {
  clef: Clef;
  items: StaffItem[];
  timeSignature?: boolean;
  className?: string;
}) {
  const width = timeSignature ? 300 : 150;
  const first = timeSignature ? 92 : 70;
  const span = width - first - 4;
  return (
    <svg
      viewBox={`0 -6 ${width} 112`}
      className={cn("w-full text-foreground", className)}
      role="img"
      aria-label={`Pentagramma, ${CLEF_LABEL[clef].toLowerCase()}`}
      fill="none"
      stroke="currentColor"
    >
      {LINES.map((y) => (
        <line key={y} x1={2} x2={width - 2} y1={y} y2={y} strokeWidth={1} />
      ))}
      <line x1={width - 2} x2={width - 2} y1={30} y2={70} strokeWidth={timeSignature ? 2 : 1} />
      <path d={CLEF_PATH[clef]} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      {clef === "bass" && (
        <g fill="currentColor" stroke="none">
          <circle cx={14} cy={41} r={3.6} />
          <circle cx={42} cy={35} r={2.2} />
          <circle cx={42} cy={45} r={2.2} />
        </g>
      )}
      {timeSignature && (
        <g fill="currentColor" stroke="none" fontSize={25} fontWeight={700} textAnchor="middle">
          <text x={62} y={49}>
            {BEATS_PER_MEASURE}
          </text>
          <text x={62} y={69}>
            4
          </text>
        </g>
      )}
      {items.map((item, i) => (
        <Note
          key={i}
          item={item}
          clef={clef}
          x={item.start === undefined ? first + span / 2 - 10 : first + ((item.start + 0.25) / BEATS_PER_MEASURE) * span}
        />
      ))}
    </svg>
  );
}
