import { cn } from "@/lib/utils";
import type { AssignmentStatus, AttendanceStatus, LessonStatus, PaymentStatus } from "@/types";
import { ASSIGNMENT_META, ATTENDANCE_META, LESSON_META, PAYMENT_META, type Tone } from "@/utils/status";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
  primary: "bg-indigo-soft text-brand-ink",
  secondary: "bg-violet-soft text-violet-ink",
};

export function toneClass(tone: Tone) {
  return TONE_CLASS[tone];
}

/** Pill badge (radius full) — differenzia i tag dalle card cliccabili rettangolari. */
export function Pill({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] leading-none font-semibold whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const m = ATTENDANCE_META[status];
  return (
    <Pill tone={m.tone}>
      <span aria-hidden>{m.glyph}</span> {m.label}
    </Pill>
  );
}

export function AssignmentBadge({ status }: { status: AssignmentStatus }) {
  const m = ASSIGNMENT_META[status];
  return (
    <Pill tone={m.tone} dot>
      {m.label}
    </Pill>
  );
}

export function LessonBadge({ status }: { status: LessonStatus }) {
  const m = LESSON_META[status];
  return (
    <Pill tone={m.tone} dot>
      {m.label}
    </Pill>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const m = PAYMENT_META[status];
  return (
    <Pill tone={m.tone} dot>
      {m.label}
    </Pill>
  );
}
