"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Campo form accessibile: label associata, errore annunciato (aria-describedby + role=alert).
 * `children` riceve id e attributi ARIA da applicare al controllo.
 */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Lista di checkbox (es. selezione studenti/corsi/materiali) con altezza touch adeguata. */
export function CheckList<T extends { id: string; label: string; sub?: string }>({
  items,
  selected,
  onChange,
  label,
  emptyText = "Nessun elemento",
  maxHeight = "max-h-56",
}: {
  items: T[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  emptyText?: string;
  maxHeight?: string;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[13px] font-medium">{label}</legend>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className={cn("space-y-1 overflow-y-auto rounded-lg border border-input bg-card p-1", maxHeight)}>
          {items.map((it) => (
            <label
              key={it.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted has-checked:bg-indigo-soft/60"
            >
              <input
                type="checkbox"
                className="size-[18px] rounded accent-primary"
                checked={selected.includes(it.id)}
                onChange={() => toggle(it.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{it.label}</span>
                {it.sub && <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
