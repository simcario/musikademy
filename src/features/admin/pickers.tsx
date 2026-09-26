"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useCourses } from "@/features/student-area/hooks";
import { fullName } from "@/utils/format";
import { useActiveStudents } from "./hooks";

type SelectProps = Omit<React.ComponentProps<typeof NativeSelect>, "children">;

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

export function CourseSelect({ placeholder = "Nessun corso", ...props }: SelectProps & { placeholder?: string }) {
  const q = useCourses();
  return (
    <NativeSelect {...props} disabled={q.isPending || props.disabled}>
      <option value="">{placeholder}</option>
      {q.data
        ?.filter((c) => c.active)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
    </NativeSelect>
  );
}
