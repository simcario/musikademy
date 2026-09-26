"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Library, Loader2, Megaphone, Search, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { qk } from "@/hooks/query-keys";
import { useDebounce } from "@/hooks/use-debounce";
import { globalSearch, type SearchHit } from "@/services/searchService";
import { searchToken } from "@/utils/keywords";

const KIND: Record<SearchHit["kind"], { label: string; icon: typeof Search }> = {
  student: { label: "Studenti", icon: UserRound },
  lesson: { label: "Lezioni", icon: CalendarDays },
  material: { label: "Materiali", icon: Library },
  assignment: { label: "Esercizi", icon: BookOpen },
  announcement: { label: "Comunicazioni", icon: Megaphone },
};

/** Ricerca globale (§28): studenti, lezioni, materiali, esercizi, comunicazioni. */
export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 250);
  const token = searchToken(debounced);
  const router = useRouter();
  const results = useQuery({
    queryKey: qk.search(token ?? ""),
    queryFn: () => globalSearch(debounced),
    enabled: !!token && open,
    staleTime: 30_000,
  });

  const groups = (Object.keys(KIND) as SearchHit["kind"][])
    .map((k) => ({ kind: k, hits: (results.data ?? []).filter((h) => h.kind === k) }))
    .filter((g) => g.hits.length);

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-4 max-h-[85dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12vh] sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Ricerca globale</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-5 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca studenti, lezioni, materiali…"
            aria-label="Cerca"
            className="h-14 flex-1 bg-transparent text-base outline-none"
          />
          {results.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        <div className="max-h-[65dvh] overflow-y-auto p-2" aria-live="polite">
          {!token ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Digita almeno 2 caratteri.</p>
          ) : results.isSuccess && groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nessun risultato per “{debounced}”.</p>
          ) : (
            groups.map((g) => {
              const Icon = KIND[g.kind].icon;
              return (
                <div key={g.kind} className="py-1">
                  <p className="section-label px-3 py-1.5">{KIND[g.kind].label}</p>
                  <ul>
                    {g.hits.map((h) => (
                      <li key={`${h.kind}-${h.id}`}>
                        <button
                          type="button"
                          onClick={() => go(h.href)}
                          className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-muted focus-visible:bg-muted"
                        >
                          <Icon className="size-4 shrink-0 text-brand-ink" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{h.title}</span>
                            {h.subtitle && <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
