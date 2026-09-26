"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Segmented control (tab "DA FARE / IN CORSO / COMPLETATI", filtri lezioni…). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 rounded-xl bg-surface-mid p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-all",
              active ? "bg-card text-brand-ink shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] leading-5",
                  active ? "bg-indigo-soft text-brand-ink" : "bg-surface-high text-muted-foreground",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Chip di filtro scorrevoli orizzontalmente (libreria materiali). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined && ` (${o.count})`}
          </button>
        );
      })}
    </div>
  );
}
