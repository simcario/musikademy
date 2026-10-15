"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Plus, School, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { UserAvatar } from "@/components/shared/brand";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { TabBar } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStudentsPage } from "@/features/admin/hooks";
import { CourseSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { CoursesTab } from "@/features/organization/courses-tab";
import { DetailPanel } from "@/features/organization/detail-panel";
import { TABLE_HEAD, rowClass, usePanel } from "@/features/organization/panel";
import { TeachersTab } from "@/features/organization/teachers-tab";
import { useRoles } from "@/features/roles/hooks";
import { RolesTab } from "@/features/roles/roles-tab";
import { useCourses, useTeachers } from "@/features/student-area/hooks";
import { StudentFormDialog } from "@/features/students/student-form";
import { useDebounce } from "@/hooks/use-debounce";
import { can } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { StudentStatus } from "@/types";
import { byName, sortName } from "@/utils/format";

type Tab = "courses" | "users" | "teachers" | "roles";

export default function OrganizationPage() {
  return (
    <Suspense>
      <Organization />
    </Suspense>
  );
}

function Organization() {
  const router = useRouter();
  const tabParam = useSearchParams().get("tab");
  const { access } = useSession();
  const isAdmin = can(access, "settings:manage");
  const canRoles = can(access, "roles:manage");
  const tab: Tab =
    tabParam === "users" || tabParam === "teachers" || (tabParam === "roles" && canRoles) ? tabParam : "courses";
  const [creating, setCreating] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const courses = useCourses();
  const teachers = useTeachers();
  const panelOpen = usePanel().stack.length > 0;

  return (
    // Su schermi larghi l'elenco si restringe accanto al pannello invece di finirci sotto.
    // `w-auto`: con `w-full` il margine destro sposterebbe la larghezza fuori dallo schermo senza ridurla.
    <PageContainer className={cn("max-w-5xl", panelOpen && "xl:mr-[clamp(480px,40vw,640px)] xl:ml-0 xl:w-auto xl:max-w-none")}>
      <PageHeader
        title="Organizzazione"
        actions={
          tab === "users" ? (
            <Button onClick={() => setCreating(true)}>
              <UserPlus aria-hidden /> Nuovo utente
            </Button>
          ) : tab === "teachers" ? (
            isAdmin && (
              <Button onClick={() => setCreatingTeacher(true)}>
                <UserPlus aria-hidden /> Nuovo membro dello staff
              </Button>
            )
          ) : tab === "roles" ? (
            <Button onClick={() => setCreatingRole(true)}>
              <Plus aria-hidden /> Nuovo ruolo
            </Button>
          ) : (
            isAdmin && (
              <Button onClick={() => setCreatingCourse(true)}>
                <Plus aria-hidden /> Nuovo corso
              </Button>
            )
          )
        }
      />
      <TabBar<Tab>
        label="Sezione"
        value={tab}
        onChange={(t) => router.replace(t === "courses" ? "/admin/organization" : `/admin/organization?tab=${t}`, { scroll: false })}
        options={[
          { value: "courses", label: "Corsi", icon: School, count: courses.data?.length },
          { value: "users", label: "Utenti", icon: Users },
          { value: "teachers", label: "Staff", icon: ShieldCheck, count: teachers.data?.length },
          ...(canRoles ? [{ value: "roles" as const, label: "Ruoli", icon: KeyRound }] : []),
        ]}
      />
      {tab === "users" ? (
        <UsersTab creating={creating} onCreatingChange={setCreating} />
      ) : tab === "roles" ? (
        <RolesTab creating={creatingRole} onCreatingChange={setCreatingRole} />
      ) : tab === "teachers" ? (
        <TeachersTab editable={isAdmin} creating={creatingTeacher} onCreatingChange={setCreatingTeacher} />
      ) : (
        <CoursesTab creating={creatingCourse} onCreatingChange={setCreatingCourse} />
      )}
      <DetailPanel />
    </PageContainer>
  );
}

/** Utenti dell'area personale (studenti, musicisti…), trasversali ai corsi: se ne possono frequentare più di uno. */
function UsersTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (o: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "all">("active");
  const [courseId, setCourseId] = useState("");
  const setCreating = onCreatingChange;
  const panel = usePanel();
  const debounced = useDebounce(search);
  const q = useStudentsPage({ search: debounced, status, courseId: courseId || undefined });
  const roleNames = new Map((useRoles().data ?? []).map((r) => [r.id, r.name]));
  const students = (q.data?.pages.flatMap((p) => p.items) ?? []).sort(byName);

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
          title={debounced ? "Nessun utente trovato" : "Nessun utente"}
          action={
            !debounced && (
              <Button onClick={() => setCreating(true)}>
                <UserPlus aria-hidden /> Aggiungi il primo utente
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
                <th className="hidden px-4 py-3 @md:table-cell">Ruolo</th>
                <th className="hidden px-4 py-3 @xl:table-cell">Email</th>
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
                            {sortName(s)}
                          </button>
                          <span className="block truncate text-xs text-muted-foreground @xl:hidden">{s.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 @md:table-cell">{roleNames.get(s.roleId ?? "student") ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground @xl:table-cell">{s.email}</td>
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
