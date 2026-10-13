"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { UserAvatar } from "@/components/shared/brand";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { Segmented } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useGroups, useStudentsPage } from "@/features/admin/hooks";
import { CourseSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { CoursesTab } from "@/features/organization/courses-tab";
import { DetailPanel } from "@/features/organization/detail-panel";
import { TABLE_HEAD, rowClass, usePanel } from "@/features/organization/panel";
import { useCourses } from "@/features/student-area/hooks";
import { StudentFormDialog } from "@/features/students/student-form";
import { useDebounce } from "@/hooks/use-debounce";
import { can } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { toGroupMap } from "@/services/groupService";
import { toCourseMap } from "@/services/userService";
import type { StudentStatus } from "@/types";
import { fullName } from "@/utils/format";

type Tab = "courses" | "users";

export default function OrganizationPage() {
  return (
    <Suspense>
      <Organization />
    </Suspense>
  );
}

function Organization() {
  const router = useRouter();
  const tab: Tab = useSearchParams().get("tab") === "users" ? "users" : "courses";
  const { role } = useSession();
  const [creating, setCreating] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const courses = useCourses();
  const panelOpen = usePanel().stack.length > 0;

  return (
    // Su schermi larghi l'elenco si restringe accanto al pannello invece di finirci sotto.
    <PageContainer className={cn("max-w-5xl", panelOpen && "xl:mr-[clamp(480px,40vw,640px)] xl:ml-0 xl:max-w-none")}>
      <PageHeader
        title="Organizzazione"
        actions={
          tab === "users" ? (
            <Button onClick={() => setCreating(true)}>
              <UserPlus aria-hidden /> Nuovo studente
            </Button>
          ) : (
            can(role, "settings:manage") && (
              <Button onClick={() => setCreatingCourse(true)}>
                <Plus aria-hidden /> Nuovo corso
              </Button>
            )
          )
        }
      />
      <Segmented
        label="Sezione"
        value={tab}
        onChange={(t) => router.replace(t === "users" ? "/admin/organization?tab=users" : "/admin/organization", { scroll: false })}
        className="sm:max-w-sm"
        options={[
          { value: "courses", label: "Corsi", count: courses.data?.length },
          { value: "users", label: "Utenti" },
        ]}
      />
      {tab === "users" ? (
        <UsersTab creating={creating} onCreatingChange={setCreating} />
      ) : (
        <CoursesTab creating={creatingCourse} onCreatingChange={setCreatingCourse} />
      )}
      <DetailPanel />
    </PageContainer>
  );
}

/** Tutti gli studenti, trasversali ai corsi: uno studente può frequentarne più di uno. */
function UsersTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (o: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "all">("active");
  const [courseId, setCourseId] = useState("");
  const setCreating = onCreatingChange;
  const panel = usePanel();
  const debounced = useDebounce(search);
  const q = useStudentsPage({ search: debounced, status, courseId: courseId || undefined });
  const courses = toCourseMap(useCourses().data);
  const groups = toGroupMap(useGroups().data);
  const students = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_160px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome, cognome o email"
            aria-label="Cerca utenti"
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
        <div className="card-surface @container overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className={TABLE_HEAD}>
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="hidden px-4 py-3 @2xl:table-cell">Email</th>
                <th className="hidden px-4 py-3 @md:table-cell">Corsi</th>
                <th className="hidden px-4 py-3 @4xl:table-cell">Gruppi</th>
                <th className="px-4 py-3">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => {
                const selected = panel.selected("user", s.id);
                return (
                  <tr key={s.id} onClick={() => panel.show("user", s.id)} aria-selected={selected} className={rowClass(selected)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar person={s} />
                        <div className="min-w-0">
                          <button type="button" className="block max-w-full truncate text-left font-semibold">
                            {fullName(s)}
                          </button>
                          <span className="block truncate text-xs text-muted-foreground @2xl:hidden">{s.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground @2xl:table-cell">{s.email}</td>
                    <td className="hidden px-4 py-3 @md:table-cell">
                      <Tags tone="primary" names={s.courseIds.map((c) => courses.get(c)?.name)} />
                    </td>
                    <td className="hidden px-4 py-3 @4xl:table-cell">
                      <Tags tone="secondary" names={(s.groupIds ?? []).map((g) => groups.get(g)?.name)} />
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={s.status === "active" ? "success" : "neutral"} dot>
                        {s.status === "active" ? "Attivo" : "Disattivato"}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
      <StudentFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function Tags({ names, tone }: { names: (string | undefined)[]; tone: "primary" | "secondary" }) {
  const shown = names.filter((n): n is string => !!n);
  if (!shown.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((n) => (
        <Pill key={n} tone={tone}>
          {n}
        </Pill>
      ))}
    </div>
  );
}
