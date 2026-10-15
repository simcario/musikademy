"use client";

import { useState } from "react";
import { BookOpen, FilePlus2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { MaterialActions, MaterialIcon, materialSizeLabel } from "@/features/materials/material-card";
import { MaterialEditorDialog } from "@/features/materials/material-editor";
import { MaterialFormDialog } from "@/features/materials/material-form";
import { materialService } from "@/services/materialService";
import { EXERCISE_CATEGORY, type Material, type WithId } from "@/types";
import { formatShortDate } from "@/utils/format";
import { AssignmentFormDialog } from "./assignment-form";

/** Catalogo docente degli esercizi con materiale (PDF, audio, video…): si caricano qui e si assegnano agli studenti. */
export function MaterialExerciseCatalog() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WithId<Material> | null>(null);
  const [assigning, setAssigning] = useState<WithId<Material> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Material> | null>(null);
  const q = useMaterialsPage({ category: EXERCISE_CATEGORY, sort: "recent" });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const remove = useStaffMutation((m: WithId<Material>) => materialService.remove(m), {
    success: "Esercizio eliminato dal catalogo",
    invalidate: [["materials"]],
    onSuccess: () => setToDelete(null),
  });

  return (
    <section className="space-y-3" aria-labelledby="material-exercises">
      {/* Il titolo è già nella scheda della pagina Esercizi: resta per gli screen reader. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h2 id="material-exercises" className="sr-only">
          Esercizi con materiale
        </h2>
        <Button onClick={() => setCreating(true)}>
          <FilePlus2 aria-hidden /> Nuovo esercizio
        </Button>
      </div>

      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nessun esercizio in catalogo"
          description="Carica uno spartito, un audio o una dispensa: potrai assegnarlo a uno o più studenti."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="card-surface flex flex-wrap items-center gap-3 p-3">
              <MaterialIcon type={m.type} className="size-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[m.description, materialSizeLabel(m), formatShortDate(m.createdAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <MaterialActions material={m} compact />
                <Button onClick={() => setAssigning(m)}>
                  <Plus aria-hidden /> Assegna
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Azioni ${m.title}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                    <MoreVertical className="size-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-10" onClick={() => setEditing(m)}>
                      <Pencil aria-hidden /> Modifica
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

      <MaterialFormDialog exercise open={creating} onOpenChange={setCreating} />
      <MaterialEditorDialog exercise open={!!editing} onOpenChange={(o) => !o && setEditing(null)} material={editing} />
      <AssignmentFormDialog
        open={!!assigning}
        onOpenChange={(o) => !o && setAssigning(null)}
        defaults={assigning ? { title: assigning.title, description: assigning.description, materialIds: [assigning.id] } : undefined}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare l'esercizio dal catalogo?"
        description="Il file verrà rimosso definitivamente: gli studenti a cui è già stato assegnato non potranno più aprirlo."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </section>
  );
}
