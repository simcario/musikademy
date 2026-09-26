"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList } from "@/components/shared/form";
import { LoadMore } from "@/components/shared/states";
import { useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { materialService } from "@/services/materialService";
import { CATEGORY_META } from "@/utils/status";

/** Assegna materiali già caricati a uno studente (visibilità additiva). */
export function AssignMaterialsDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  studentName: string;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const debounced = useDebounce(search);
  const q = useMaterialsPage({ search: debounced, sort: "recent" });
  const items = (q.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => !m.studentIds?.includes(studentId));

  const assign = useStaffMutation(
    async () => {
      const all = q.data?.pages.flatMap((p) => p.items) ?? [];
      await Promise.all(
        all.filter((m) => selected.includes(m.id)).map((m) => materialService.assignToStudents(m, [studentId])),
      );
    },
    {
      success: `Materiali assegnati a ${studentName}`,
      invalidate: [["materials"]],
      onSuccess: () => {
        setSelected([]);
        onOpenChange(false);
      },
    },
  );

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Assegna materiali" description={`A ${studentName}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (selected.length) assign.mutate(undefined);
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca materiale" aria-label="Cerca materiale" className="pl-9" />
        </div>
        <CheckList
          label={`Materiali (${selected.length} selezionati)`}
          items={items.map((m) => ({ id: m.id, label: m.title, sub: CATEGORY_META[m.category].label }))}
          selected={selected}
          onChange={setSelected}
          emptyText={q.isPending ? "Caricamento…" : "Nessun materiale da assegnare."}
          maxHeight="max-h-72"
        />
        <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
        <FormActions onCancel={() => onOpenChange(false)} submitting={assign.isPending} submitLabel="Assegna" />
      </form>
    </FormDialog>
  );
}
