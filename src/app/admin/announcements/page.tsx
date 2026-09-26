"use client";

import { useState } from "react";
import { Megaphone, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useActiveStudents, useAnnouncementsPage, useStaffMutation } from "@/features/admin/hooks";
import { AnnouncementFormDialog } from "@/features/announcements/announcement-form";
import { useCourses } from "@/features/student-area/hooks";
import { announcementService } from "@/services/announcementService";
import { toCourseMap } from "@/services/userService";
import type { Announcement, WithId } from "@/types";
import { formatDate, fullName } from "@/utils/format";

export default function AdminAnnouncementsPage() {
  const q = useAnnouncementsPage();
  const courses = toCourseMap(useCourses().data);
  const students = useActiveStudents();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WithId<Announcement> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Announcement> | null>(null);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const remove = useStaffMutation((a: WithId<Announcement>) => announcementService.remove(a.id), {
    success: "Comunicazione eliminata",
    invalidate: [["announcements"]],
    onSuccess: () => setToDelete(null),
  });

  const target = (a: WithId<Announcement>) => {
    if (a.targetType === "all") return "Tutti gli studenti";
    if (a.targetType === "course") return `Corso: ${courses.get(a.targetId ?? "")?.name ?? "—"}`;
    const s = students.data?.find((x) => x.id === a.targetId);
    return `Studente: ${s ? fullName(s) : "—"}`;
  };

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Comunicazioni"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden /> Nuova comunicazione
          </Button>
        }
      />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Megaphone} title="Nessuna comunicazione" />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="card-surface space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="secondary">{target(a)}</Pill>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(a.publishedAt)} · {a.authorName}
                  </span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Azioni ${a.title}`} className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-full hover:bg-muted">
                    <MoreVertical className="size-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="min-h-10" onClick={() => setEditing(a)}>
                      <Pencil aria-hidden /> Modifica
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(a)}>
                      <Trash2 aria-hidden /> Elimina
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <h2 className="font-semibold">{a.title}</h2>
              <p className="line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{a.content}</p>
            </li>
          ))}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
      <AnnouncementFormDialog open={creating} onOpenChange={setCreating} />
      <AnnouncementFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} announcement={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare la comunicazione?"
        description="Non sarà più visibile agli studenti."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </PageContainer>
  );
}
