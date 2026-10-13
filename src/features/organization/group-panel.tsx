"use client";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { useGroups } from "@/features/admin/hooks";
import { useCourses } from "@/features/student-area/hooks";
import { GroupForm } from "./group-list";
import { PanelBody, PanelHeader, usePanel } from "./panel";

/** Livello "gruppo" del pannello: nome, corso e studenti del gruppo. */
export function GroupPanel({ groupId }: { groupId: string }) {
  const panel = usePanel();
  const groups = useGroups();
  const courses = useCourses();
  const group = groups.data?.find((g) => g.id === groupId);
  const course = courses.data?.find((c) => c.id === group?.courseId);

  return (
    <>
      <PanelHeader title={group?.name ?? "Gruppo"} description={group ? (course?.name ?? "Senza corso") : undefined} />
      <PanelBody>
        {groups.isPending ? (
          <ListSkeleton rows={2} />
        ) : groups.isError ? (
          <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
        ) : !group ? (
          <EmptyState title="Gruppo non trovato" />
        ) : (
          <GroupForm group={group} onDone={panel.stack.length > 1 ? panel.back : panel.close} />
        )}
      </PanelBody>
    </>
  );
}
