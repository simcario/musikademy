"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/features/auth/auth-provider";
import { qk } from "@/hooks/query-keys";
import { announcementService } from "@/services/announcementService";
import { assignmentService } from "@/services/assignmentService";
import { attendanceService } from "@/services/attendanceService";
import type { StaffScope } from "@/services/base";
import { folderService } from "@/services/folderService";
import { groupService } from "@/services/groupService";
import { lessonService } from "@/services/lessonService";
import { materialService, type MaterialFilters } from "@/services/materialService";
import { feeService, paymentService, type MoneyOwner, type PaymentFilters } from "@/services/paymentService";
import { playlistService, songService } from "@/services/playlistService";
import { studentService, type StudentFilters } from "@/services/studentService";
import { teacherService } from "@/services/userService";
import type { AssignmentStatus, LessonStatus } from "@/types";
import { AppError, errorMessage } from "@/utils/errors";
import { fullName } from "@/utils/format";

/**
 * Mutazione standard dell'area docente: toast di esito + invalidazione delle liste coinvolte.
 * `invalidate` sono prefissi di chiave (es. ["lessons"]).
 */
export function useStaffMutation<V, R = unknown>(
  fn: (vars: V) => Promise<R>,
  opts: { success?: string | ((r: R, v: V) => string); invalidate: string[][]; onSuccess?: (r: R, v: V) => void },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      const msg = typeof opts.success === "function" ? opts.success(r, v) : opts.success;
      if (msg) toast.success(msg);
      opts.invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(r, v);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/**
 * Chi sta usando l'area docente (ADR D34): uid, admin o docente e i corsi a cui è abilitato
 * (`teachers/{uid}.courseIds`, gli stessi che leggono le rules). `null` finché non è caricato:
 * le query dell'area docente partono solo dopo, con i vincoli giusti.
 */
export function useStaffScope(): StaffScope | null {
  const { uid, role } = useSession();
  const teacher = useQuery({ queryKey: qk.teacher(uid), queryFn: () => teacherService.get(uid), staleTime: 10 * 60_000 });
  const courseIds = teacher.data?.courseIds;
  // Senza documento docente (o se non si legge) nessun corso: si vede solo ciò che si è creato.
  const loaded = teacher.isSuccess || teacher.isError;
  return useMemo(
    () => (loaded ? { uid, admin: role === "admin", courseIds: courseIds ?? [] } : null),
    [loaded, uid, role, courseIds],
  );
}

/** Per le mutazioni: restituisce lo scope, o un errore leggibile se non è ancora caricato. */
export function useScopeGetter() {
  const scope = useStaffScope();
  return () => {
    if (!scope) throw new AppError("Un momento: sto ancora caricando i tuoi corsi. Riprova.");
    return scope;
  };
}

/** Lo scope e se la query può partire. */
function scoped(scope: StaffScope | null) {
  return { enabled: !!scope, scope: scope as StaffScope };
}

/** Il docente come titolare di costi e quote (economia personale, ADR D34). */
export function useMoneyOwner(): MoneyOwner {
  const { uid, profile } = useSession();
  return { uid, name: profile ? fullName(profile) : "" };
}

export function useStudentsPage(filters: StudentFilters) {
  const { enabled, scope } = scoped(useStaffScope());
  return useInfiniteQuery({
    queryKey: qk.students({ ...filters, courses: scope?.courseIds }),
    queryFn: ({ pageParam }) => studentService.page(filters, pageParam, scope),
    enabled,
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useActiveStudents() {
  const { enabled, scope } = scoped(useStaffScope());
  return useQuery({
    queryKey: [...qk.activeStudents(), scope?.courseIds ?? []],
    queryFn: () => studentService.listActive(scope),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** `enabled` falso dove il componente è condiviso con l'area personale (brani, playlist). */
export function useGroups(enabled = true) {
  const { enabled: ready, scope } = scoped(useStaffScope());
  return useQuery({
    queryKey: [...qk.groups(), scope?.courseIds ?? []],
    queryFn: () => groupService.list(scope),
    enabled: enabled && ready,
    staleTime: 5 * 60_000,
  });
}

export function useFolders() {
  const { enabled, scope } = scoped(useStaffScope());
  return useQuery({ queryKey: qk.folders("staff"), queryFn: () => folderService.list(scope), enabled, staleTime: 5 * 60_000 });
}

export function usePlaylists(enabled = true) {
  const { enabled: ready, scope } = scoped(useStaffScope());
  return useQuery({ queryKey: qk.playlists("staff"), queryFn: () => playlistService.list(scope), enabled: enabled && ready });
}

/** I brani (ADR D29): l'admin tutti, il docente i propri (ADR D34). */
export function useSongs(enabled = true) {
  const { enabled: ready, scope } = scoped(useStaffScope());
  return useQuery({ queryKey: qk.songs("staff"), queryFn: () => songService.list(scope), enabled: enabled && ready });
}

export function useStudent(uid: string) {
  return useQuery({ queryKey: qk.student(uid), queryFn: () => studentService.get(uid) });
}

export function useStudentNotes(uid: string) {
  return useQuery({ queryKey: qk.studentNotes(uid), queryFn: () => studentService.getNotes(uid) });
}

export function useLessonsInRange(from: Date, days: number) {
  const key = from.toDateString();
  const { enabled, scope } = scoped(useStaffScope());
  return useQuery({
    queryKey: qk.lessons({ range: key, days }),
    queryFn: () => lessonService.listInRange(from, days, scope),
    enabled,
  });
}

export function useLessonsPage(filters: { studentId?: string; status?: LessonStatus | "all" }) {
  const { enabled, scope } = scoped(useStaffScope());
  return useInfiniteQuery({
    queryKey: qk.lessons({ page: filters }),
    queryFn: ({ pageParam }) => lessonService.page(filters, pageParam, scope),
    enabled,
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useAttendanceMap(lessonIds: string[]) {
  const { enabled, scope } = scoped(useStaffScope());
  return useQuery({
    queryKey: qk.attendance({ lessons: lessonIds }),
    queryFn: () => attendanceService.mapForLessons(lessonIds, scope),
    enabled: enabled && lessonIds.length > 0,
  });
}

export function useStudentAttendance(studentId: string) {
  const { enabled, scope } = scoped(useStaffScope());
  return useQuery({
    queryKey: qk.attendance({ student: studentId }),
    queryFn: () => attendanceService.listForStudent(studentId, scope),
    enabled,
  });
}

export function useMaterialsPage(filters: MaterialFilters) {
  const { enabled, scope } = scoped(useStaffScope());
  return useInfiniteQuery({
    queryKey: qk.materials({ staff: filters }),
    queryFn: ({ pageParam }) => materialService.page(filters, pageParam, scope),
    enabled,
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useAssignmentsPage(filters: { studentId?: string; status?: AssignmentStatus | "all" }) {
  const { enabled, scope } = scoped(useStaffScope());
  return useInfiniteQuery({
    queryKey: qk.assignments({ staff: filters }),
    queryFn: ({ pageParam }) => assignmentService.page(filters, pageParam, scope),
    enabled,
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

/** Quote del docente: ognuno, admin compreso, vede solo le proprie (ADR D34). */
export function usePaymentsPage(filters: PaymentFilters) {
  const { uid } = useSession();
  return useInfiniteQuery({
    queryKey: qk.payments({ staff: filters }),
    queryFn: ({ pageParam }) => paymentService.page(filters, pageParam, uid),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function usePaymentTotals(range?: { from: Date; to: Date }, enabled = true) {
  const { uid } = useSession();
  return useQuery({
    enabled,
    queryKey: qk.payments({ totals: range ? [range.from.toISOString(), range.to.toISOString()] : "all" }),
    queryFn: () => paymentService.totals(uid, range),
  });
}

/** Costi del docente: tutti, o solo quelli di uno studente. */
export function useMyFees(studentId?: string) {
  const { uid } = useSession();
  return useQuery({
    queryKey: qk.fees(studentId ?? "all"),
    queryFn: () => (studentId ? feeService.listForStudent(studentId, uid) : feeService.listMine(uid)),
  });
}

export function useAnnouncementsPage() {
  const { enabled, scope } = scoped(useStaffScope());
  return useInfiniteQuery({
    queryKey: qk.announcements({ staff: true }),
    queryFn: ({ pageParam }) => announcementService.page(pageParam, scope),
    enabled,
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

/** `payments`: il ruolo può vedere gli incassi (ADR D31); altrimenti le rules negherebbero la lettura. */
export function useDashboardStats(payments = true) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const { enabled, scope } = scoped(useStaffScope());
  return {
    today: useQuery({ queryKey: qk.stats("lessons-today"), queryFn: () => lessonService.countInRange(today, 1, scope), enabled }),
    week: useQuery({ queryKey: qk.stats("lessons-week"), queryFn: () => lessonService.countInRange(monday, 7, scope), enabled }),
    attendance: useQuery({ queryKey: qk.stats("attendance-rate"), queryFn: () => attendanceService.overallRate(scope), enabled }),
    payments: usePaymentTotals(undefined, payments),
    students: useActiveStudents(),
  };
}
