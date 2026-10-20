"use client";

import { Fragment, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  FilePlus2,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Library,
  MoreVertical,
  NotebookPen,
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
import { TabBar } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useFolders, useMaterialsPage, useScopeGetter, useStaffMutation } from "@/features/admin/hooks";
import {
  FolderNameDialog,
  FolderShareDialog,
  MoveFolderDialog,
  MoveToFolderDialog,
} from "@/features/materials/folder-dialogs";
import { Marquee } from "@/components/shared/marquee";
import { CATEGORY_ICON, MaterialActions, MaterialIcon, materialSizeLabel } from "@/features/materials/material-card";
import { MaterialAssignDialog } from "@/features/materials/material-assign-dialog";
import { MaterialEditorDialog } from "@/features/materials/material-editor";
import { MaterialFormDialog } from "@/features/materials/material-form";
import { TextCreateDialog } from "@/features/materials/text-create-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { folderPath, folderPathName, folderService, parentIdOf, toFolderMap } from "@/services/folderService";
import { materialService } from "@/services/materialService";
import {
  EXERCISE_CATEGORY,
  LIBRARY_CATEGORIES,
  type Material,
  type MaterialCategory,
  type MaterialFolder,
  type WithId,
} from "@/types";
import { formatShortDate } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A chi è visibile il materiale, in breve; `null` = a nessuno. */
function audienceLabel(m: Material): string | null {
  const groups = m.groupIds?.length ?? 0;
  const viaFolder = (m.audience ?? []).some((id) => !(m.groupIds ?? []).includes(id) && !(m.playlistAudience ?? []).includes(id));
  const parts = [
    m.visibility === "all" ? "Tutti" : m.visibility === "course" ? "Corso" : null,
    groups ? count(groups, "gruppo", "gruppi") : null,
    m.studentIds?.length ? count(m.studentIds.length, "studente", "studenti") : null,
    viaFolder ? "Cartella" : null,
    m.playlistAudience?.length ? "Playlist" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Con chi è condivisa la cartella, direttamente o tramite una cartella superiore. */
function sharingLabel(f: MaterialFolder): string {
  const own = [...(f.studentIds ?? []), ...(f.groupIds ?? [])];
  const parts = [
    f.groupIds?.length ? count(f.groupIds.length, "gruppo", "gruppi") : null,
    f.studentIds?.length ? count(f.studentIds.length, "studente", "studenti") : null,
    (f.audience ?? []).some((id) => !own.includes(id)) ? "eredita dalla cartella superiore" : null,
  ].filter(Boolean);
  return parts.length ? `Condivisa: ${parts.join(" · ")}` : "Non condivisa";
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
  const [sort, setSort] = useState<"recent" | "title">("title");
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingText, setCreatingText] = useState(false);
  const [editing, setEditing] = useState<WithId<Material> | null>(null);
  const [assigning, setAssigning] = useState<WithId<Material> | null>(null);
  const [moving, setMoving] = useState<WithId<Material> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Material> | null>(null);
  const [folderForm, setFolderForm] = useState<{ folder: WithId<MaterialFolder> | null } | null>(null);
  const [sharing, setSharing] = useState<WithId<MaterialFolder> | null>(null);
  const [movingFolder, setMovingFolder] = useState<WithId<MaterialFolder> | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<WithId<MaterialFolder> | null>(null);
  const debounced = useDebounce(search);
  const folders = useFolders();
  const folderMap = toFolderMap(folders.data);
  const openFolder = openFolderId ? (folderMap.get(openFolderId) ?? null) : null;
  const parentFolder = openFolder?.parentId ? (folderMap.get(openFolder.parentId) ?? null) : null;
  // Cartelle del livello aperto: quelle di primo livello, oppure le sottocartelle di quella aperta.
  const subfolders = (folders.data ?? []).filter((f) => parentIdOf(f, folderMap) === (openFolder?.id ?? ""));
  const q = useMaterialsPage({ category, search: debounced, sort, folderId: openFolder?.id });
  // Gli esercizi hanno il loro catalogo nella sezione Esercizi.
  const items = (q.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.category !== EXERCISE_CATEGORY);

  const getScope = useScopeGetter();
  const remove = useStaffMutation((m: WithId<Material>) => materialService.remove(m, getScope()), {
    success: "Materiale eliminato",
    invalidate: [["materials"]],
    onSuccess: () => setToDelete(null),
  });
  const removeFolder = useStaffMutation((f: WithId<MaterialFolder>) => folderService.remove(f.id, getScope()), {
    success: "Cartella eliminata",
    invalidate: [["folders"], ["materials"]],
    onSuccess: (_r, f) => {
      setFolderToDelete(null);
      // Eliminata la cartella aperta: si torna a quella superiore.
      if (f.id === openFolderId) setOpenFolderId(f.parentId || null);
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
        <DropdownMenuItem className="min-h-10" onClick={() => setMovingFolder(f)}>
          <FolderInput aria-hidden /> Sposta
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
              <FolderPlus aria-hidden /> {openFolder ? "Nuova sottocartella" : "Nuova cartella"}
            </Button>
            <Button variant="outline" onClick={() => setCreatingText(true)}>
              <NotebookPen aria-hidden /> Nuovo testo
            </Button>
            <Button onClick={() => setCreating(true)}>
              <FilePlus2 aria-hidden /> Carica materiale
            </Button>
          </>
        }
      />

      {openFolder && (
        <div className="space-y-2">
          <nav aria-label="Percorso" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <button type="button" className="rounded px-1 font-medium hover:text-foreground hover:underline" onClick={() => setOpenFolderId(null)}>
              Materiali
            </button>
            {folderPath(openFolder.id, folderMap).map((f) => (
              <Fragment key={f.id}>
                <ChevronRight className="size-4 shrink-0" aria-hidden />
                {f.id === openFolder.id ? (
                  <span aria-current="page" className="px-1 font-semibold text-foreground">
                    {f.name}
                  </span>
                ) : (
                  <button type="button" className="rounded px-1 font-medium hover:text-foreground hover:underline" onClick={() => setOpenFolderId(f.id)}>
                    {f.name}
                  </button>
                )}
              </Fragment>
            ))}
          </nav>
          <div className="card-surface flex items-center gap-2 p-2 pl-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={parentFolder ? `Torna a ${parentFolder.name}` : "Torna a tutti i materiali"}
              onClick={() => setOpenFolderId(parentFolder?.id ?? null)}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <FolderOpen className="size-6 shrink-0 text-brand-ink" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{openFolder.name}</h2>
              <p className="truncate text-xs text-muted-foreground">{sharingLabel(openFolder)}</p>
            </div>
            <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setSharing(openFolder)}>
              <Share2 aria-hidden /> Condividi
            </Button>
            {folderMenu(openFolder)}
          </div>
        </div>
      )}

      {subfolders.length > 0 && (
        <section aria-label={openFolder ? "Sottocartelle" : "Cartelle"} className="space-y-2">
          <h2 className="section-label">{openFolder ? "Sottocartelle" : "Cartelle"}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {subfolders.map((f) => (
              <li key={f.id} className="card-surface flex items-center gap-1 pr-1">
                <button
                  type="button"
                  onClick={() => setOpenFolderId(f.id)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted/50"
                >
                  <Folder className="size-6 shrink-0 text-brand-ink" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{f.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{sharingLabel(f)}</span>
                  </span>
                </button>
                {folderMenu(f)}
              </li>
            ))}
          </ul>
        </section>
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
          <option value="title">Titolo A–Z</option>
          <option value="recent">Più recenti</option>
        </NativeSelect>
      </div>
      <TabBar
        label="Categoria"
        value={category}
        onChange={setCategory}
        options={(["all", ...LIBRARY_CATEGORIES] as const).map((c) => ({
          value: c,
          label: c === "all" ? "Tutti" : CATEGORY_META[c].plural,
          icon: CATEGORY_ICON[c],
        }))}
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
            const folderName = !openFolder && m.folderId ? folderPathName(m.folderId, folderMap) : undefined;
            return (
              <li key={m.id} className="card-surface flex items-center gap-3 p-3">
                <MaterialIcon type={m.type} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <Marquee>{m.title}</Marquee>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[CATEGORY_META[m.category].label, materialSizeLabel(m), formatShortDate(m.createdAt), folderName]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1">
                    {audience ? <Pill tone="secondary">{audience}</Pill> : <Pill tone="warning">Non assegnato</Pill>}
                  </div>
                </div>
                {/* Un solo menu: azioni del materiale e, dopo, quelle di gestione. */}
                <MaterialActions
                  material={m}
                  compact
                  menuItems={
                    <>
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
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />

      {/* La chiave ripropone cartella e categoria aperte a ogni nuovo caricamento ("Tutti" = categoria da scegliere). */}
      <MaterialFormDialog
        key={`${openFolder?.id ?? "root"}:${category}`}
        open={creating}
        onOpenChange={setCreating}
        folderId={openFolder?.id}
        category={category === "all" ? undefined : category}
      />
      <TextCreateDialog open={creatingText} onOpenChange={setCreatingText} folderId={openFolder?.id} onCreated={setEditing} />
      <MaterialEditorDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} material={editing} />
      <MaterialAssignDialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)} material={assigning} />
      <MoveToFolderDialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)} material={moving} />
      <FolderNameDialog
        open={!!folderForm}
        onOpenChange={(o) => !o && setFolderForm(null)}
        folder={folderForm?.folder}
        parent={openFolder}
        onCreated={setOpenFolderId}
      />
      <FolderShareDialog open={!!sharing} onOpenChange={(o) => !o && setSharing(null)} folder={sharing} />
      <MoveFolderDialog open={!!movingFolder} onOpenChange={(o) => !o && setMovingFolder(null)} folder={movingFolder} />
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
        description="Materiali e sottocartelle non vengono eliminati: salgono nella cartella superiore e non sono più visibili a chi li vedeva solo grazie alla condivisione di questa cartella."
        confirmLabel="Elimina cartella"
        destructive
        loading={removeFolder.isPending}
        onConfirm={() => folderToDelete && removeFolder.mutate(folderToDelete)}
      />
    </PageContainer>
  );
}
