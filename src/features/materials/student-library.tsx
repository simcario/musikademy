"use client";

import { useState } from "react";
import { Library, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FilterChips } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { useMyMaterials } from "@/features/student-area/hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { useNow } from "@/hooks/use-now";
import type { MaterialCategory } from "@/types";
import { toDate } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";
import { NowPlayingCard } from "./audio-dock";
import { MaterialCard, NewPill } from "./material-card";

type CategoryFilter = MaterialCategory | "all";

const STUDENT_CATEGORIES: CategoryFilter[] = ["all", "dispensa", "ascolto", "base", "video", "spartito", "immagine", "esercizio", "altro"];

/** Libreria materiali studente: ricerca, filtri per categoria, ordinamento, paginazione progressiva. */
export function StudentLibrary({ categories = STUDENT_CATEGORIES }: { categories?: CategoryFilter[] }) {
  const [category, setCategory] = useState<CategoryFilter>(categories[0]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const debounced = useDebounce(search);
  const q = useMyMaterials({ category, search: debounced, sort });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const weekAgo = useNow() - 7 * 86_400_000;

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca spartiti, audio, dispense…"
          aria-label="Cerca nei materiali"
          className="h-12 bg-surface-mid pl-10"
        />
      </div>

      {categories.length > 1 && (
        <FilterChips
          label="Categoria"
          value={category}
          onChange={setCategory}
          options={categories.map((c) => ({ value: c, label: c === "all" ? "Tutti" : CATEGORY_META[c].plural }))}
        />
      )}

      <NowPlayingCard />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {category === "all" ? "Tutti i materiali" : CATEGORY_META[category].plural}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Ordina per</span>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as "recent" | "title")} className="w-40">
            <option value="recent">Più recenti</option>
            <option value="title">Titolo A–Z</option>
          </NativeSelect>
        </label>
      </div>

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Library}
          title={debounced ? "Nessun risultato" : "Nessun materiale disponibile"}
          description={debounced ? "Prova con un'altra parola." : "Quando il docente ti assegnerà dei materiali li troverai qui."}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((m) => (
            <li key={m.id}>
              <MaterialCard material={m} badge={(toDate(m.createdAt)?.getTime() ?? 0) > weekAgo ? <NewPill /> : undefined} />
            </li>
          ))}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
    </div>
  );
}
