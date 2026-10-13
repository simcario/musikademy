"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Se presente il segmento mostra solo l'icona: l'etichetta resta per screen reader e tooltip. */
  icon?: LucideIcon;
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
            title={o.icon ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-all",
              active ? "bg-card text-brand-ink shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon && <o.icon className="size-5" aria-hidden />}
            <span className={o.icon ? "sr-only" : "truncate"}>{o.label}</span>
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

/**
 * Barra delle sezioni (pannelli studente e corso): icona sopra l'etichetta, sezione attiva a blocco pieno.
 * Se le sezioni non entrano in una riga la barra scorre, con una freccia sul lato dove ce ne sono altre.
 */
export function TabBar<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: (SegmentOption<T> & { icon: LucideIcon })[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  // Il ResizeObserver misura subito e a ogni cambio di larghezza (pannello stretto, rotazione).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, options.length]);

  // La sezione attiva resta visibile anche se è stata scelta da un link esterno alla barra.
  useEffect(() => {
    const el = scroller.current;
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !active) return;
    const hiddenLeft = active.offsetLeft < el.scrollLeft;
    const hiddenRight = active.offsetLeft + active.offsetWidth > el.scrollLeft + el.clientWidth;
    if (hiddenLeft || hiddenRight) el.scrollTo({ left: active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2 });
  }, [value]);

  const slide = (dir: 1 | -1) => {
    const el = scroller.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };
  const arrow = (side: "left" | "right") => {
    const Icon = side === "left" ? ChevronLeft : ChevronRight;
    return (
      more[side] && (
        <button
          type="button"
          // Solo per il puntatore: da tastiera e screen reader le sezioni sono già tutte raggiungibili.
          tabIndex={-1}
          aria-hidden
          onClick={() => slide(side === "left" ? -1 : 1)}
          className={cn(
            "absolute inset-y-0 z-10 flex w-9 items-center text-brand-ink",
            side === "left"
              ? "left-0 justify-start bg-gradient-to-r from-card from-55% to-transparent pl-1"
              : "right-0 justify-end bg-gradient-to-l from-card from-55% to-transparent pr-1",
          )}
        >
          <Icon className="size-5" />
        </button>
      )
    );
  };

  return (
    <div className={cn("card-surface relative overflow-hidden", className)}>
      {arrow("left")}
      <div ref={scroller} role="tablist" aria-label={label} onScroll={measure} className="no-scrollbar flex overflow-x-auto">
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
                "flex min-h-16 min-w-[4.75rem] flex-1 shrink-0 flex-col items-center justify-center gap-1 px-3 py-2 text-[11px] leading-tight font-semibold whitespace-nowrap transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <o.icon className="size-5" aria-hidden />
              <span>
                {o.label}
                {o.count !== undefined && <span className={active ? "opacity-80" : "opacity-70"}> {o.count}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {arrow("right")}
    </div>
  );
}

/** Chip di filtro scorrevoli orizzontalmente (libreria materiali); con `wrap` vanno a capo (pannelli stretti). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  wrap,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  wrap?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={wrap ? "flex flex-wrap gap-2" : "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"}
    >
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
