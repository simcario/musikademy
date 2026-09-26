"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilePlus2, Library, MoreVertical, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterChips } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { MaterialActions, MaterialIcon } from "@/features/materials/material-card";
import { MaterialFormDialog } from "@/features/materials/material-form";
import { useDebounce } from "@/hooks/use-debounce";
import { materialService } from "@/services/materialService";
import { MATERIAL_CATEGORIES, type Material, type MaterialCategory, type WithId } from "@/types";
import { formatFileSize, formatShortDate } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";

const VISIBILITY_LABEL = { all: "Tutti", course: "Corso", student: "Studenti" } as const;

export default function AdminMaterialsPage() {
  return (
    <Suspense>
      <Materials />
    </Suspense>
  );
}

function Materials() {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState<MaterialCategory | "all">("all");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WithId<Material> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Material> | null>(null);
  const debounced = useDebounce(search);
  const q = useMaterialsPage({ category, search: debounced, sort });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const remove = useStaffMutation((m: WithId<Material>) => materialService.remove(m), {
    success: "Materiale eliminato",
    invalidate: [["materials"]],
    onSuccess: () => setToDelete(null),
  });

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Materiali"
        description="Dispense, ascolti, basi, video e spartiti."
        actions={
          <Button onClick={() => setCreating(true)}>
            <FilePlus2 aria-hidden /> Carica materiale
          </Button>
        }
      />
      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per titolo" aria-label="Cerca materiali" className="pl-9" />
        </div>
        <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as "recent" | "title")} aria-label="Ordina">
          <option value="recent">Più recenti</option>
          <option value="title">Titolo A–Z</option>
        </NativeSelect>
      </div>
      <FilterChips
        label="Categoria"
        value={category}
        onChange={setCategory}
        options={[{ value: "all" as const, label: "Tutti" }, ...MATERIAL_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].plural }))]}
      />

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Library}
          title={debounced ? "Nessun risultato" : "Nessun materiale"}
          action={
            !debounced && (
              <Button onClick={() => setCreating(true)}>
                <FilePlus2 aria-hidden /> Carica il primo materiale
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="card-surface flex flex-wrap items-center gap-3 p-3">
              <MaterialIcon type={m.type} className="size-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {CATEGORY_META[m.category].label} · {formatFileSize(m.size)} · {formatShortDate(m.createdAt)}
                </p>
              </div>
              <Pill tone="secondary">
                {VISIBILITY_LABEL[m.visibility]}
                {m.studentIds?.length ? ` · ${m.studentIds.length}` : ""}
              </Pill>
              <div className="flex items-center gap-1">
                <MaterialActions material={m} compact />
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Azioni ${m.title}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                    <MoreVertical className="size-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-10" onClick={() => setEditing(m)}>
                      <Pencil aria-hidden /> Modifica / assegna
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(m)}>
                      <Trash2 aria-hidden /> Elimina
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />

      <MaterialFormDialog open={creating} onOpenChange={setCreating} />
      <MaterialFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} material={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare il materiale?"
        description="Il file verrà rimosso definitivamente e non sarà più visibile agli studenti."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </PageContainer>
  );
}
