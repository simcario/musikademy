"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStudentContext, type StudentContextOption } from "./context";

const KIND_LABEL = { group: "Gruppo", course: "Corso" } as const;
const KIND_PLURAL = { group: "Gruppi", course: "Corsi" } as const;

/** Barra in alto dell'area studente: gruppo o corso attivo, fisso, con il tasto "Cambia". */
export function ContextSwitcher() {
  const { options, current, select } = useStudentContext();
  if (!current) return null;
  const byKind = (kind: StudentContextOption["kind"]) => options.filter((o) => o.kind === kind);
  const valueOf = (o: StudentContextOption) => `${o.kind}:${o.id}`;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="flex min-w-0 flex-col">
        <span className="text-[11px] leading-tight font-medium text-muted-foreground">{KIND_LABEL[current.kind]}</span>
        <span className="truncate text-sm leading-tight font-bold text-brand-ink">{current.label}</span>
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Cambia gruppo o corso (attivo: ${current.label})`}
          className="flex h-9 shrink-0 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-brand-ink hover:bg-surface-high"
        >
          Cambia
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuRadioGroup
            value={valueOf(current)}
            onValueChange={(v) => {
              const next = options.find((o) => valueOf(o) === v);
              if (next) select(next);
            }}
          >
            {(["group", "course"] as const).map(
              (kind) =>
                byKind(kind).length > 0 && (
                  <DropdownMenuGroup key={kind}>
                    <DropdownMenuLabel>{KIND_PLURAL[kind]}</DropdownMenuLabel>
                    {byKind(kind).map((o) => (
                      <DropdownMenuRadioItem key={valueOf(o)} value={valueOf(o)} className="min-h-10">
                        <span className="truncate">{o.label}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuGroup>
                ),
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
