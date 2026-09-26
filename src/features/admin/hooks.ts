"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/hooks/query-keys";
import { announcementService } from "@/services/announcementService";
import { assignmentService } from "@/services/assignmentService";
import { attendanceService } from "@/services/attendanceService";
import { lessonService } from "@/services/lessonService";
import { materialService, type MaterialFilters } from "@/services/materialService";
import { paymentService, type PaymentFilters } from "@/services/paymentService";
import { studentService, type StudentFilters } from "@/services/studentService";
import type { AssignmentStatus, LessonStatus } from "@/types";
import { errorMessage } from "@/utils/errors";

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

export function useStudentsPage(filters: StudentFilters) {
  return useInfiniteQuery({
    queryKey: qk.students(filters),
    queryFn: ({ pageParam }) => studentService.page(filters, pageParam),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useActiveStudents() {
  return useQuery({ queryKey: qk.activeStudents(), queryFn: studentService.listActive, staleTime: 5 * 60_000 });
}

export function useStudent(uid: string) {
  return useQuery({ queryKey: qk.student(uid), queryFn: () => studentService.get(uid) });
}

export function useStudentNotes(uid: string) {
  return useQuery({ queryKey: qk.studentNotes(uid), queryFn: () => studentService.getNotes(uid) });
}

export function useLessonsInRange(from: Date, days: number) {
  const key = from.toDateString();
  return useQuery({ queryKey: qk.lessons({ range: key, days }), queryFn: () => lessonService.listInRange(from, days) });
}

export function useLessonsPage(filters: { studentId?: string; status?: LessonStatus | "all" }) {
  return useInfiniteQuery({
    queryKey: qk.lessons({ page: filters }),
    queryFn: ({ pageParam }) => lessonService.page(filters, pageParam),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useAttendanceMap(lessonIds: string[]) {
  return useQuery({
    queryKey: qk.attendance({ lessons: lessonIds }),
    queryFn: () => attendanceService.mapForLessons(lessonIds),
    enabled: lessonIds.length > 0,
  });
}

export function useStudentAttendance(studentId: string) {
  return useQuery({
    queryKey: qk.attendance({ student: studentId }),
    queryFn: () => attendanceService.listForStudent(studentId),
  });
}

export function useMaterialsPage(filters: MaterialFilters) {
  return useInfiniteQuery({
    queryKey: qk.materials({ staff: filters }),
    queryFn: ({ pageParam }) => materialService.page(filters, pageParam),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useAssignmentsPage(filters: { studentId?: string; status?: AssignmentStatus | "all" }) {
  return useInfiniteQuery({
    queryKey: qk.assignments({ staff: filters }),
    queryFn: ({ pageParam }) => assignmentService.page(filters, pageParam),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function usePaymentsPage(filters: PaymentFilters) {
  return useInfiniteQuery({
    queryKey: qk.payments({ staff: filters }),
    queryFn: ({ pageParam }) => paymentService.page(filters, pageParam),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function usePaymentTotals(range?: { from: Date; to: Date }) {
  return useQuery({
    queryKey: qk.payments({ totals: range ? [range.from.toISOString(), range.to.toISOString()] : "all" }),
    queryFn: () => paymentService.totals(range),
  });
}

export function useAnnouncementsPage() {
  return useInfiniteQuery({
    queryKey: qk.announcements({ staff: true }),
    queryFn: ({ pageParam }) => announcementService.page(pageParam),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useDashboardStats() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return {
    today: useQuery({ queryKey: qk.stats("lessons-today"), queryFn: () => lessonService.countInRange(today, 1) }),
    week: useQuery({ queryKey: qk.stats("lessons-week"), queryFn: () => lessonService.countInRange(monday, 7) }),
    attendance: useQuery({ queryKey: qk.stats("attendance-rate"), queryFn: attendanceService.overallRate }),
    payments: usePaymentTotals(),
    students: useActiveStudents(),
  };
}
