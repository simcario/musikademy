"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useCourses } from "@/features/student-area/hooks";
import { fullName } from "@/utils/format";
import { useActiveStudents, useStaffScope } from "./hooks";

type SelectProps = Omit<React.ComponentProps<typeof NativeSelect>, "children">;

/**
 * Corsi attivi che chi usa l'area docente può scegliere (ADR D29): l'admin tutti, il docente
 * quelli a cui è abilitato. Con `teacherId` solo quelli di quel docente (es. l'admin che
 * programma una lezione per un altro docente).
 */
export function useSelectableCourses(teacherId?: string) {
  const courses = useCourses();
  const scope = useStaffScope();
  const data = (courses.data ?? []).filter(
    (c) =>
      c.active &&
      (teacherId ? c.teacherIds.includes(teacherId) : scope?.admin || scope?.courseIds.includes(c.id)),
  );
  return { data, isPending: courses.isPending || !scope };
}

export { subjectsFor } from "@/utils/fees";

export function StudentSelect({ placeholder = "Seleziona studente", ...props }: SelectProps & { placeholder?: string }) {
  const q = useActiveStudents();
  return (
    <NativeSelect {...props} disabled={q.isPending || props.disabled}>
      <option value="">{q.isPending ? "Caricamento…" : placeholder}</option>
      {q.data?.map((s) => (
        <option key={s.id} value={s.id}>
          {fullName(s)}
        </option>
      ))}
    </NativeSelect>
  );
}

export function CourseSelect({
  placeholder = "Nessun corso",
  teacherId,
  ...props
}: SelectProps & { placeholder?: string; teacherId?: string }) {
  const q = useSelectableCourses(teacherId);
  return (
    <NativeSelect {...props} disabled={q.isPending || props.disabled}>
      <option value="">{placeholder}</option>
      {q.data.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </NativeSelect>
  );
}
