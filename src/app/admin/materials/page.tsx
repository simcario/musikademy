"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  FilePlus2,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Library,
  MoreVertical,
  Pencil,
  Search,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
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
import { useFolders, useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { FolderNameDialog, FolderShareDialog, MoveToFolderDialog } from "@/features/materials/folder-dialogs";
import { MaterialActions, MaterialIcon } from "@/features/materials/material-card";
import { MaterialAssignDialog } from "@/features/materials/material-assign-dialog";
import { MaterialEditorDialog } from "@/features/materials/material-editor";
import { MaterialFormDialog } from "@/features/materials/material-form";
import { useDebounce } from "@/hooks/use-debounce";
import { folderService, toFolderMap } from "@/services/folderService";
import { materialService } from "@/services/materialService";
import {
  EXERCISE_CATEGORY,
  LIBRARY_CATEGORIES,
  type Material,
  type MaterialCategory,
  type MaterialFolder,
  type WithId,
} from "@/types";
import { formatFileSize, formatShortDate } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A chi è visibile il materiale, in breve; `null` = a nessuno. */
function audienceLabel(m: Material): string | null {
  const groups = m.groupIds?.length ?? 0;
  const viaFolder = (m.audience ?? []).some((id) => !(m.groupIds ?? []).includes(id));
  const parts = [
    m.visibility === "all" ? "Tutti" : m.visibility === "course" ? "Corso" : null,
    groups ? count(groups, "gruppo", "gruppi") : null,
    m.studentIds?.length ? count(m.studentIds.length, "studente", "studenti") : null,
    viaFolder ? "Cartella" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function sharingLabel(f: MaterialFolder): string | null {
  const parts = [
    f.groupIds?.length ? count(f.groupIds.length, "gruppo", "gruppi") : null,
    f.studentIds?.length ? count(f.studentIds.length, "studente", "studenti") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

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
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WithId<Material> | null>(null);
  const [assigning, setAssigning] = useState<WithId<Material> | null>(null);
  const [moving, setMoving] = useState<WithId<Material> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Material> | null>(null);
  const [folderForm, setFolderForm] = useState<{ folder: WithId<MaterialFolder> | null } | null>(null);
  const [sharing, setSharing] = useState<WithId<MaterialFolder> | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<WithId<MaterialFolder> | null>(null);
  const debounced = useDebounce(search);
  const folders = useFolders();
  const folderMap = toFolderMap(folders.data);
  const openFolder = openFolderId ? (folderMap.get(openFolderId) ?? null) : null;
  const q = useMaterialsPage({ category, search: debounced, sort, folderId: openFolder?.id });
  // Gli esercizi hanno il loro catalogo nella sezione Esercizi.
  const items = (q.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.category !== EXERCISE_CATEGORY);

  const remove = useStaffMutation((m: WithId<Material>) => materialService.remove(m), {
    success: "Materiale eliminato",
    invalidate: [["materials"]],
    onSuccess: () => setToDelete(null),
  });
  const removeFolder = useStaffMutation((f: WithId<MaterialFolder>) => folderService.remove(f.id), {
    success: "Cartella eliminata",
    invalidate: [["folders"], ["materials"]],
    onSuccess: () => {
      setFolderToDelete(null);
      setOpenFolderId(null);
    },
  });

  const folderMenu = (f: WithId<MaterialFolder>) => (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Azioni cartella ${f.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted">
        <MoreVertical className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem className="min-h-10" onClick={() => setSharing(f)}>
          <Share2 aria-hidden /> Condividi
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10" onClick={() => setFolderForm({ folder: f })}>
          <Pencil aria-hidden /> Rinomina
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setFolderToDelete(f)}>
          <Trash2 aria-hidden /> Elimina
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Materiali"
        description="Dispense, ascolti, basi, video e spartiti."
        actions={
          <>
            <Button variant="outline" onClick={() => setFolderForm({ folder: null })}>
              <FolderPlus aria-hidden /> Nuova cartella
            </Button>
            <Button onClick={() => setCreating(true)}>
              <FilePlus2 aria-hidden /> Carica materiale
            </Button>
          </>
        }
      />

      {openFolder ? (
        <div className="card-surface flex items-center gap-2 p-2 pl-1">
          <Button variant="ghost" size="icon" aria-label="Torna a tutti i materiali" onClick={() => setOpenFolderId(null)}>
            <ArrowLeft aria-hidden />
          </Button>
          <FolderOpen className="size-6 shrink-0 text-brand-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{openFolder.name}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {sharingLabel(openFolder) ? `Condivisa con ${sharingLabel(openFolder)}` : "Non condivisa"}
            </p>
          </div>
          <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setSharing(openFolder)}>
            <Share2 aria-hidden /> Condividi
          </Button>
          {folderMenu(openFolder)}
        </div>
      ) : (
        !!folders.data?.length && (
          <section aria-label="Cartelle" className="space-y-2">
            <h2 className="section-label">Cartelle</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {folders.data.map((f) => (
                <li key={f.id} className="card-surface flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => setOpenFolderId(f.id)}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <Folder className="size-6 shrink-0 text-brand-ink" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{sharingLabel(f) ?? "Non condivisa"}</span>
                    </span>
                  </button>
                  {folderMenu(f)}
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={openFolder ? "Cerca nella cartella" : "Cerca per titolo"}
            aria-label="Cerca materiali"
            className="pl-9"
          />
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
        options={[{ value: "all" as const, label: "Tutti" }, ...LIBRARY_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].plural }))]}
      />

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={openFolder ? FolderOpen : Library}
          title={debounced ? "Nessun risultato" : openFolder ? "Cartella vuota" : "Nessun materiale"}
          description={
            !debounced && openFolder ? "Carica un materiale qui, oppure spostane uno dal suo menu → Sposta in cartella." : undefined
          }
          action={
            !debounced && (
              <Button onClick={() => setCreating(true)}>
                <FilePlus2 aria-hidden /> {openFolder ? "Carica in questa cartella" : "Carica il primo materiale"}
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((m) => {
            const audience = audienceLabel(m);
            const folderName = !openFolder && m.folderId ? folderMap.get(m.folderId)?.name : undefined;
            return (
              <li key={m.id} className="card-surface flex flex-wrap items-center gap-3 p-3">
                <MaterialIcon type={m.type} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[CATEGORY_META[m.category].label, formatFileSize(m.size), formatShortDate(m.createdAt), folderName]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {audience ? <Pill tone="secondary">{audience}</Pill> : <Pill tone="warning">Non assegnato</Pill>}
                <div className="flex items-center gap-1">
                  <MaterialActions material={m} compact />
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label={`Azioni ${m.title}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                      <MoreVertical className="size-5" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem className="min-h-10" onClick={() => setEditing(m)}>
                        <Pencil aria-hidden /> Modifica
                      </DropdownMenuItem>
                      <DropdownMenuItem className="min-h-10" onClick={() => setAssigning(m)}>
                        <Users aria-hidden /> Assegna
                      </DropdownMenuItem>
                      <DropdownMenuItem className="min-h-10" onClick={() => setMoving(m)}>
                        <FolderInput aria-hidden /> Sposta in cartella
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(m)}>
                        <Trash2 aria-hidden /> Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />

      {/* La chiave ripropone la cartella aperta a ogni nuovo caricamento. */}
      <MaterialFormDialog key={openFolder?.id ?? "root"} open={creating} onOpenChange={setCreating} folderId={openFolder?.id} />
      <MaterialEditorDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} material={editing} />
      <MaterialAssignDialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)} material={assigning} />
      <MoveToFolderDialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)} material={moving} />
      <FolderNameDialog
        open={!!folderForm}
        onOpenChange={(o) => !o && setFolderForm(null)}
        folder={folderForm?.folder}
        onCreated={setOpenFolderId}
      />
      <FolderShareDialog open={!!sharing} onOpenChange={(o) => !o && setSharing(null)} folder={sharing} />
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
      <ConfirmDialog
        open={!!folderToDelete}
        onOpenChange={(o) => !o && setFolderToDelete(null)}
        title={`Eliminare la cartella “${folderToDelete?.name ?? ""}”?`}
        description="I materiali non vengono eliminati: escono dalla cartella e non sono più visibili a chi li vedeva solo grazie alla sua condivisione."
        confirmLabel="Elimina cartella"
        destructive
        loading={removeFolder.isPending}
        onConfirm={() => folderToDelete && removeFolder.mutate(folderToDelete)}
      />
    </PageContainer>
  );
}
