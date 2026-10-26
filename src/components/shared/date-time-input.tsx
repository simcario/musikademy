"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  format,
  getYear,
  isSameDay,
  isSameMonth,
  setYear,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fromInputDate, toInputDate } from "@/utils/format";

/**
 * Selettori di data e ora dell'app: sostituiscono `<input type="date|time">`, che il browser mostra nel formato
 * della lingua del sistema. La data si legge sempre gg/mm/aaaa, l'ora sempre a 24 ore con l'orologio stile Android.
 * I valori restano quelli degli input nativi ("yyyy-MM-dd" e "HH:mm", vuoto = nessun valore), così schemi e
 * conversioni non cambiano. Con react-hook-form si usano tramite `Controller` (`{...field}`).
 */
type PickerProps = {
  id?: string;
  name?: string;
  value: string | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Mostra "Cancella" nel selettore, per i campi facoltativi. */
  clearable?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2026-09-26" → "26/09/2026" */
export function displayDate(value: string | undefined): string {
  return value && DATE_RE.test(value) ? value.split("-").reverse().join("/") : "";
}

function Trigger({
  icon: Icon,
  text,
  placeholder,
  open,
  onOpen,
  ref,
  id,
  name,
  disabled,
  onBlur,
  className,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: Omit<PickerProps, "value" | "onChange" | "placeholder" | "clearable"> & {
  icon: typeof Clock;
  text: string;
  placeholder: string;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      ref={ref}
      id={id}
      name={name}
      disabled={disabled}
      onClick={onOpen}
      onBlur={() => !open && onBlur?.()}
      aria-haspopup="dialog"
      aria-describedby={describedBy}
      data-invalid={invalid || undefined}
      className={cn(
        "flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-base tabular-nums transition-colors outline-none sm:h-10 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        "data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:bg-input/30 dark:data-invalid:border-destructive/50 dark:data-invalid:ring-destructive/40",
        className,
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate", !text && "text-muted-foreground")}>{text || placeholder}</span>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function PickerActions({
  clearable,
  onClear,
  onCancel,
  onConfirm,
  extra,
}: {
  clearable?: boolean;
  onClear: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 px-3 pb-3">
      {clearable && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Cancella
        </Button>
      )}
      {extra}
      <span className="flex-1" />
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Annulla
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={onConfirm}>
        OK
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- Data */

const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

export function DateInput({ value, onChange, clearable, placeholder = "gg/mm/aaaa", ...rest }: PickerProps) {
  const { onBlur } = rest;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(new Date());
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [yearMode, setYearMode] = useState(false);

  const openPicker = () => {
    const current = value && DATE_RE.test(value) ? fromInputDate(value) : new Date();
    setDraft(current);
    setMonth(startOfMonth(current));
    setYearMode(false);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    onBlur?.();
  };
  const commit = (v: string) => {
    onChange(v);
    close();
  };

  const gridStart = startOfWeek(month, { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  return (
    <>
      <Trigger {...rest} icon={CalendarDays} text={displayDate(value)} placeholder={placeholder} open={open} onOpen={openPicker} />
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent showCloseButton={false} className="w-[min(328px,calc(100%-2rem))] gap-0 overflow-hidden p-0">
          <div className="bg-primary px-5 py-4 text-primary-foreground">
            <DialogTitle className="text-xs font-medium tracking-wide uppercase opacity-80">Seleziona data</DialogTitle>
            <p className="mt-1 text-2xl font-semibold capitalize tabular-nums">{format(draft, "EEE d MMM yyyy", { locale: it })}</p>
          </div>

          <div className="flex items-center gap-1 px-3 pt-3">
            <button
              type="button"
              onClick={() => setYearMode((y) => !y)}
              className="flex h-9 items-center gap-1 rounded-md px-2 text-sm font-semibold capitalize hover:bg-muted"
              aria-label={yearMode ? "Torna ai giorni" : "Scegli l'anno"}
            >
              {format(month, "MMMM yyyy", { locale: it })}
              <ChevronRight className={cn("size-4 transition-transform", yearMode ? "-rotate-90" : "rotate-90")} aria-hidden />
            </button>
            <span className="flex-1" />
            {!yearMode && (
              <>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Mese precedente">
                  <ChevronLeft />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mese successivo">
                  <ChevronRight />
                </Button>
              </>
            )}
          </div>

          {yearMode ? (
            <YearGrid
              selected={getYear(month)}
              onSelect={(y) => {
                setMonth((m) => setYear(m, y));
                setDraft((d) => setYear(d, y));
                setYearMode(false);
              }}
            />
          ) : (
            <div className="px-3 pt-1 pb-2">
              <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                {WEEKDAYS.map((d, i) => (
                  <span key={i} className="flex h-9 items-center justify-center">
                    {d}
                  </span>
                ))}
              </div>
              <div role="grid" className="grid grid-cols-7 text-center text-sm tabular-nums">
                {days.map((d) => {
                  const selected = isSameDay(d, draft);
                  const outside = !isSameMonth(d, month);
                  return (
                    <span key={d.toISOString()} className="flex items-center justify-center py-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(d);
                          if (outside) setMonth(startOfMonth(d));
                        }}
                        aria-pressed={selected}
                        aria-label={format(d, "EEEE d MMMM yyyy", { locale: it })}
                        className={cn(
                          "size-10 rounded-full transition-colors",
                          selected
                            ? "bg-primary font-semibold text-primary-foreground"
                            : cn("hover:bg-muted", isSameDay(d, today) && "border border-primary text-primary", outside && "text-muted-foreground/50"),
                        )}
                      >
                        {format(d, "d")}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <PickerActions
            clearable={clearable}
            onClear={() => commit("")}
            onCancel={close}
            onConfirm={() => commit(toInputDate(draft))}
            extra={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(today);
                  setMonth(startOfMonth(today));
                  setYearMode(false);
                }}
              >
                Oggi
              </Button>
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function YearGrid({ selected, onSelect }: { selected: number; onSelect: (year: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const now = getYear(new Date());
  const years = Array.from({ length: 111 }, (_, i) => now - 100 + i);
  useEffect(() => ref.current?.scrollIntoView({ block: "center" }), []);
  return (
    <div className="grid h-[19.5rem] grid-cols-3 content-start gap-1 overflow-y-auto px-3 py-2 text-sm tabular-nums">
      {years.map((y) => (
        <button
          key={y}
          ref={y === selected ? ref : undefined}
          type="button"
          onClick={() => onSelect(y)}
          className={cn("h-10 rounded-full", y === selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Ora */

const pad = (n: number) => n.toString().padStart(2, "0");

const SIZE = 256;
const C = SIZE / 2;
const OUTER_R = 104;
const INNER_R = 68;
/** Come Android: anello esterno 12, 1…11; anello interno 00, 13…23. */
const OUTER_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const INNER_HOURS = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

function point(index: number, of: number, r: number) {
  const a = (index / of) * 2 * Math.PI;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

export function TimeInput({
  minuteStep = 1,
  value,
  onChange,
  clearable,
  placeholder = "--:--",
  ...rest
}: PickerProps & { minuteStep?: number }) {
  const { onBlur } = rest;
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const [mode, setMode] = useState<"hours" | "minutes">("hours");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const openPicker = () => {
    const [h, m] = value && TIME_RE.test(value) ? value.split(":").map(Number) : [new Date().getHours(), 0];
    setHour(h);
    setMinute(Math.round(m / minuteStep) * minuteStep % 60);
    setMode("hours");
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    onBlur?.();
  };
  const commit = (v: string) => {
    onChange(v);
    close();
  };

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((e.clientX - box.left) / box.width) * SIZE - C;
    const y = ((e.clientY - box.top) / box.height) * SIZE - C;
    const angle = (Math.atan2(x, -y) * 180) / Math.PI;
    const deg = (angle + 360) % 360;
    if (mode === "hours") {
      const idx = Math.round(deg / 30) % 12;
      const inner = Math.hypot(x, y) < (OUTER_R + INNER_R) / 2;
      setHour(inner ? INNER_HOURS[idx] : OUTER_HOURS[idx]);
    } else {
      setMinute((Math.round(deg / 6 / minuteStep) * minuteStep) % 60);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    if (mode === "hours") setHour((h) => (h + delta + 24) % 24);
    else setMinute((m) => (m + delta * minuteStep + 60) % 60);
  };

  const hourInner = INNER_HOURS.includes(hour);
  const hand =
    mode === "hours"
      ? point(hour % 12, 12, hourInner ? INNER_R : OUTER_R)
      : point(minute, 60, OUTER_R);
  const labels =
    mode === "hours"
      ? [
          ...OUTER_HOURS.map((h, i) => ({ v: h, text: String(h), ...point(i, 12, OUTER_R), small: false })),
          ...INNER_HOURS.map((h, i) => ({ v: h, text: pad(h), ...point(i, 12, INNER_R), small: true })),
        ]
      : Array.from({ length: 12 }, (_, i) => ({ v: i * 5, text: pad(i * 5), ...point(i, 12, OUTER_R), small: false }));
  const selectedValue = mode === "hours" ? hour : minute;

  return (
    <>
      <Trigger
        {...rest}
        icon={Clock}
        text={value && TIME_RE.test(value) ? value : ""}
        placeholder={placeholder}
        open={open}
        onOpen={openPicker}
      />
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent showCloseButton={false} className="w-[min(328px,calc(100%-2rem))] gap-0 overflow-hidden p-0">
          <div className="bg-primary px-5 py-4 text-primary-foreground">
            <DialogTitle className="text-xs font-medium tracking-wide uppercase opacity-80">Seleziona orario</DialogTitle>
            <p className="mt-1 flex items-center justify-center text-5xl font-semibold tabular-nums">
              <button
                type="button"
                onClick={() => setMode("hours")}
                className={cn("rounded-md px-1 transition-opacity", mode === "hours" ? "opacity-100" : "opacity-60")}
                aria-label="Ore"
              >
                {pad(hour)}
              </button>
              <span className="opacity-60">:</span>
              <button
                type="button"
                onClick={() => setMode("minutes")}
                className={cn("rounded-md px-1 transition-opacity", mode === "minutes" ? "opacity-100" : "opacity-60")}
                aria-label="Minuti"
              >
                {pad(minute)}
              </button>
            </p>
          </div>

          <div className="flex justify-center px-5 py-5">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="aspect-square w-full max-w-64 touch-none select-none outline-none focus-visible:rounded-full focus-visible:ring-3 focus-visible:ring-ring/50"
              role="slider"
              tabIndex={0}
              aria-label={mode === "hours" ? "Ore" : "Minuti"}
              aria-valuemin={0}
              aria-valuemax={mode === "hours" ? 23 : 59}
              aria-valuenow={selectedValue}
              aria-valuetext={`${pad(hour)}:${pad(minute)}`}
              onKeyDown={onKeyDown}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                pick(e);
              }}
              onPointerMove={(e) => dragging.current && pick(e)}
              onPointerUp={() => {
                dragging.current = false;
                if (mode === "hours") setMode("minutes");
              }}
              onPointerCancel={() => (dragging.current = false)}
            >
              <circle cx={C} cy={C} r={C} className="fill-muted" />
              <line x1={C} y1={C} x2={hand.x} y2={hand.y} strokeWidth={2} className="stroke-primary" />
              <circle cx={C} cy={C} r={4} className="fill-primary" />
              <circle cx={hand.x} cy={hand.y} r={18} className="fill-primary" />
              {mode === "minutes" && minute % 5 !== 0 && <circle cx={hand.x} cy={hand.y} r={3} className="fill-primary-foreground" />}
              {labels.map((l) => (
                <text
                  key={`${l.small}-${l.v}`}
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "pointer-events-none tabular-nums",
                    l.small ? "text-[12px]" : "text-[15px] font-medium",
                    l.v === selectedValue && (mode === "minutes" || l.small === hourInner)
                      ? "fill-primary-foreground"
                      : l.small
                        ? "fill-muted-foreground"
                        : "fill-foreground",
                  )}
                >
                  {l.text}
                </text>
              ))}
            </svg>
          </div>

          <PickerActions
            clearable={clearable}
            onClear={() => commit("")}
            onCancel={close}
            onConfirm={() => commit(`${pad(hour)}:${pad(minute)}`)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
