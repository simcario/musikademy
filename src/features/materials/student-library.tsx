"use client";

import { Fragment, useState } from "react";
import { ChevronRight, Folder, FolderOpen, Library, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FilterChips } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { useMyFolders, useMyMaterials } from "@/features/student-area/hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { folderPath, parentIdOf, toFolderMap } from "@/services/folderService";
import { EXERCISE_CATEGORY, type Material, type MaterialCategory, type WithId } from "@/types";
import { toDate } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";
import { useAudioDock } from "./audio-dock";
import { MaterialCard, NewPill, TrackList } from "./material-card";

type CategoryFilter = MaterialCategory | "all";

const STUDENT_CATEGORIES: CategoryFilter[] = ["all", "dispensa", "ascolto", "base", "video", "spartito", "testo", "immagine", "altro"];

/** Libreria materiali studente: ricerca, filtri per categoria, ordinamento, paginazione progressiva. */
export function StudentLibrary({ categories = STUDENT_CATEGORIES }: { categories?: CategoryFilter[] }) {
  const [category, setCategory] = useState<CategoryFilter>(categories[0]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("title");
  const [folderChoice, setFolderChoice] = useState("all");
  const debounced = useDebounce(search);
  const folders = useMyFolders().data ?? [];
  const folderMap = toFolderMap(folders);
  // Cambiando gruppo la cartella scelta può non essere più tra quelle condivise.
  const folderId = folderMap.has(folderChoice) ? folderChoice : "all";
  // Un livello alla volta: le cartelle di primo livello, poi le sottocartelle di quella aperta.
  const path = folderId === "all" ? [] : folderPath(folderId, folderMap);
  const subfolders = folders.filter((f) => parentIdOf(f, folderMap) === (folderId === "all" ? "" : folderId));
  const q = useMyMaterials({ category, search: debounced, sort, folderId: folderId === "all" ? undefined : folderId });
  // I materiali degli esercizi si aprono dall'esercizio assegnato, non dalla libreria.
  const items = (q.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.category !== EXERCISE_CATEGORY);
  const weekAgo = useNow() - 7 * 86_400_000;
  const tracks = items.filter((m) => m.type === "audio");
  const others = items.filter((m) => m.type !== "audio");
  const newBadge = (m: WithId<Material>) => ((toDate(m.createdAt)?.getTime() ?? 0) > weekAgo ? <NewPill /> : undefined);
  const playing = !!useAudioDock().track;

  return (
    <div className="space-y-5">
      {/* Il campo di ricerca resta fisso sotto la barra in alto mentre l'elenco scorre. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 bg-background px-4 py-2 md:-mx-8 md:px-8">
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
      </div>

      {categories.length > 1 && (
        <FilterChips
          label="Categoria"
          value={category}
          onChange={setCategory}
          options={categories.map((c) => ({ value: c, label: c === "all" ? "Tutti" : CATEGORY_META[c].plural }))}
        />
      )}

      {folders.length > 0 && (
        <nav aria-label="Cartelle" className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {[{ id: "all", name: "Tutti i materiali" }, ...path].map((f, i, all) => (
            <Fragment key={f.id}>
              {i > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <button
                type="button"
                aria-current={i === all.length - 1 ? "page" : undefined}
                onClick={() => setFolderChoice(f.id)}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition-colors",
                  i === all.length - 1
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {i > 0 && <FolderOpen className="size-4" aria-hidden />}
                {f.name}
              </button>
            </Fragment>
          ))}
          {subfolders.length > 0 && <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />}
          {subfolders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolderChoice(f.id)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground hover:bg-muted"
            >
              <Folder className="size-4 text-brand-ink" aria-hidden />
              {f.name}
            </button>
          ))}
        </nav>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {category === "all" ? "Tutti i materiali" : CATEGORY_META[category].plural}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Ordina per</span>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as "recent" | "title")} className="w-40">
            <option value="title">Titolo A–Z</option>
            <option value="recent">Più recenti</option>
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
        <div className="space-y-4">
          {/* Le tracce audio in un unico elenco, il resto in card. */}
          {tracks.length > 0 && <TrackList tracks={tracks} badge={newBadge} />}
          {others.length > 0 && (
            <ul className="grid gap-3 md:grid-cols-2">
              {others.map((m) => (
                <li key={m.id}>
                  <MaterialCard material={m} badge={newBadge(m)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
      {/* Su mobile il player in basso non deve coprire le ultime righe. */}
      {playing && <div className="h-16 md:hidden" aria-hidden />}
    </div>
  );
}
