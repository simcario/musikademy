"use client";

import { useState } from "react";
import { Megaphone, Paperclip } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useMyAnnouncements } from "@/features/student-area/hooks";
import { FileViewer, viewerKindOf } from "@/components/shared/file-viewer";
import type { Attachment } from "@/types";
import { formatDate } from "@/utils/format";

export default function AnnouncementsPage() {
  const q = useMyAnnouncements(50);
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Comunicazioni" description="Avvisi dalla scuola e dai tuoi docenti." />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={Megaphone} title="Nessuna comunicazione" />
      ) : (
        <ul className="space-y-3">
          {q.data.map((a) => (
            <li key={a.id}>
              <article className="card-surface space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={a.targetType === "student" ? "primary" : "secondary"}>
                    {a.targetType === "all" ? "Scuola" : a.targetType === "course" ? "Corso" : "Per te"}
                  </Pill>
                  <time className="text-xs text-muted-foreground">{formatDate(a.publishedAt)}</time>
                  <span className="text-xs text-muted-foreground">· {a.authorName}</span>
                </div>
                <h2 className="text-lg font-semibold">{a.title}</h2>
                <p className="text-sm whitespace-pre-line text-muted-foreground">{a.content}</p>
                {!!a.attachments?.length && (
                  <ul className="flex flex-wrap gap-2 pt-1">
                    {a.attachments.map((f) => (
                      <li key={f.storagePath}>
                        <AttachmentChip attachment={f} />
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1 rounded-full bg-surface-mid px-3 text-xs font-semibold text-brand-ink hover:bg-muted"
      >
        <Paperclip className="size-3.5" aria-hidden /> {attachment.name}
      </button>
      <FileViewer open={open} onOpenChange={setOpen} title={attachment.name} kind={viewerKindOf(attachment.name)} url={attachment.url} />
    </>
  );
}
