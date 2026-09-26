"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { UserAvatar } from "@/components/shared/brand";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStudentsPage } from "@/features/admin/hooks";
import { CourseSelect } from "@/features/admin/pickers";
import { useCourses } from "@/features/student-area/hooks";
import { StudentFormDialog } from "@/features/students/student-form";
import { useDebounce } from "@/hooks/use-debounce";
import { toCourseMap } from "@/services/userService";
import type { StudentStatus } from "@/types";
import { fullName } from "@/utils/format";

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "all">("active");
  const [courseId, setCourseId] = useState("");
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search);
  const q = useStudentsPage({ search: debounced, status, courseId: courseId || undefined });
  const courses = toCourseMap(useCourses().data);
  const students = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Studenti"
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus aria-hidden /> Nuovo studente
          </Button>
        }
      />
      <div className="grid gap-2 sm:grid-cols-[1fr_160px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome, cognome o email"
            aria-label="Cerca studenti"
            className="pl-9"
          />
        </div>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | "all")} aria-label="Stato">
          <option value="active">Attivi</option>
          <option value="inactive">Disattivati</option>
          <option value="all">Tutti</option>
        </NativeSelect>
        <CourseSelect
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          placeholder="Tutti i corsi"
          aria-label="Corso"
          disabled={!!debounced}
          title={debounced ? "Il filtro corso non si combina con la ricerca testuale" : undefined}
        />
      </div>

      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={debounced ? "Nessuno studente trovato" : "Nessuno studente"}
          action={
            !debounced && (
              <Button onClick={() => setCreating(true)}>
                <UserPlus aria-hidden /> Aggiungi il primo studente
              </Button>
            )
          }
        />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {students.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/students/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <UserAvatar person={s} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{fullName(s)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.email, ...s.courseIds.map((c) => courses.get(c)?.name).filter(Boolean)].join(" · ")}
                  </p>
                </div>
                {s.status === "inactive" && <Pill tone="neutral">Disattivato</Pill>}
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
      <StudentFormDialog open={creating} onOpenChange={setCreating} />
    </PageContainer>
  );
}
