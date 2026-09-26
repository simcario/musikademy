"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/hooks/query-keys";
import { useSession } from "@/features/auth/auth-provider";
import { announcementService } from "@/services/announcementService";
import { assignmentService } from "@/services/assignmentService";
import { attendanceService } from "@/services/attendanceService";
import { lessonService } from "@/services/lessonService";
import { materialService, type MaterialFilters, type StudentMaterialCursor } from "@/services/materialService";
import { paymentService } from "@/services/paymentService";
import { studentService } from "@/services/studentService";
import { courseService, teacherService } from "@/services/userService";
import type { Assignment, AssignmentStatus, LessonStatus, WithId } from "@/types";
import { errorMessage } from "@/utils/errors";

/** Hook dell'area studente: ogni query è vincolata all'UID della sessione. */

export function useMyStudentProfile() {
  const { uid } = useSession();
  return useQuery({ queryKey: qk.student(uid), queryFn: () => studentService.get(uid) });
}

function useMyCourseIds() {
  const q = useMyStudentProfile();
  return { courseIds: q.data?.courseIds ?? [], ready: q.isSuccess };
}

export function useCourses() {
  return useQuery({ queryKey: qk.courses(), queryFn: courseService.list, staleTime: 10 * 60_000 });
}

export function useTeachers() {
  return useQuery({ queryKey: qk.teachers(), queryFn: teacherService.list, staleTime: 10 * 60_000 });
}

export function useNextLesson() {
  const { uid } = useSession();
  return useQuery({ queryKey: qk.lessons({ next: uid }), queryFn: () => lessonService.nextForStudent(uid) });
}

export function useMyLessons(status?: LessonStatus) {
  const { uid } = useSession();
  return useInfiniteQuery({
    queryKey: qk.lessons({ mine: uid, status }),
    queryFn: ({ pageParam }) => lessonService.pageForStudent(uid, pageParam, status),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
}

export function useLesson(id: string) {
  return useQuery({ queryKey: qk.lesson(id), queryFn: () => lessonService.get(id), enabled: !!id });
}

export function useMyAttendance() {
  const { uid } = useSession();
  return useQuery({ queryKey: qk.attendance({ mine: uid }), queryFn: () => attendanceService.listForStudent(uid) });
}

export function useMyAttendanceFor(lessonIds: string[]) {
  const { uid } = useSession();
  return useQuery({
    queryKey: qk.attendance({ mine: uid, lessonIds }),
    queryFn: () => attendanceService.mapForStudentLessons(uid, lessonIds),
    enabled: lessonIds.length > 0,
  });
}

export function useMyAssignments() {
  const { uid } = useSession();
  return useQuery({ queryKey: qk.assignments({ mine: uid }), queryFn: () => assignmentService.listForStudent(uid) });
}

export function useLessonAssignments(lessonId: string) {
  const { uid } = useSession();
  return useQuery({
    queryKey: qk.assignments({ mine: uid, lessonId }),
    queryFn: () => assignmentService.listForLesson(lessonId, uid),
  });
}

/** Aggiornamento ottimistico dello stato esercizio (interazione immediata). */
export function useSetAssignmentStatus() {
  const { uid } = useSession();
  const qc = useQueryClient();
  const key = qk.assignments({ mine: uid });
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AssignmentStatus }) => assignmentService.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WithId<Assignment>[]>(key);
      qc.setQueryData<WithId<Assignment>[]>(key, (old) => old?.map((a) => (a.id === id ? { ...a, status } : a)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorMessage(e));
    },
    onSuccess: (_d, { status }) => {
      if (status === "completed") toast.success("Esercizio completato. Ottimo lavoro!");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
  });
}

export function useMyMaterials(filters: MaterialFilters) {
  const { uid } = useSession();
  const { courseIds, ready } = useMyCourseIds();
  return useInfiniteQuery({
    queryKey: qk.materials({ mine: uid, courseIds, ...filters }),
    queryFn: ({ pageParam }) => materialService.pageForStudent(uid, courseIds, filters, pageParam),
    initialPageParam: null as StudentMaterialCursor | null,
    getNextPageParam: (last) => last.cursor ?? undefined,
    enabled: ready,
  });
}

export function useMaterialsByIds(ids: string[]) {
  return useQuery({
    queryKey: qk.materials({ ids }),
    queryFn: () => materialService.getMany(ids),
    enabled: ids.length > 0,
  });
}

export function useMyPayments() {
  const { uid } = useSession();
  return useQuery({ queryKey: qk.payments({ mine: uid }), queryFn: () => paymentService.listForStudent(uid) });
}

export function useMyAnnouncements(max = 30) {
  const { uid } = useSession();
  const { courseIds, ready } = useMyCourseIds();
  return useQuery({
    queryKey: qk.announcements({ mine: uid, courseIds, max }),
    queryFn: () => announcementService.listForStudent(uid, courseIds, max),
    enabled: ready,
  });
}
