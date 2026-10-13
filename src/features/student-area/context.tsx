"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/auth-provider";
import { qk } from "@/hooks/query-keys";
import { groupService } from "@/services/groupService";
import type { StudentMaterialScope } from "@/services/materialService";
import { studentService } from "@/services/studentService";
import { courseService } from "@/services/userService";

export interface StudentContextOption {
  kind: "group" | "course";
  id: string;
  label: string;
}

interface StudentContextValue {
  /** Gruppi e corsi di cui lo studente fa parte. Il selettore compare solo se sono più di uno. */
  options: StudentContextOption[];
  current: StudentContextOption | null;
  select: (option: StudentContextOption) => void;
  /** Materiali da mostrare: sempre quelli personali, più il gruppo o corso selezionato. */
  scope: StudentMaterialScope;
  ready: boolean;
}

const Ctx = createContext<StudentContextValue | null>(null);
const keyOf = (o: Pick<StudentContextOption, "kind" | "id">) => `${o.kind}:${o.id}`;

/**
 * Gruppo o corso "attivo" dello studente (ADR D26): chi fa parte di più gruppi/corsi sceglie
 * dalla barra in alto quale vedere. La scelta resta salvata sul dispositivo.
 */
export function StudentContextProvider({ children }: { children: React.ReactNode }) {
  const { uid } = useSession();
  const storageKey = `musikademy.context.${uid}`;
  const [saved, setSaved] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(storageKey),
  );

  const profile = useQuery({ queryKey: qk.student(uid), queryFn: () => studentService.get(uid) });
  const groupIds = useMemo(() => profile.data?.groupIds ?? [], [profile.data]);
  const courseIds = useMemo(() => profile.data?.courseIds ?? [], [profile.data]);
  const groups = useQuery({
    queryKey: [...qk.groups(), "mine", groupIds],
    queryFn: () => groupService.getMany(groupIds),
    enabled: groupIds.length > 0,
    staleTime: 10 * 60_000,
  });
  const courses = useQuery({ queryKey: qk.courses(), queryFn: courseService.list, staleTime: 10 * 60_000 });

  const value = useMemo<StudentContextValue>(() => {
    const options: StudentContextOption[] = [
      ...(groups.data ?? [])
        .map((g) => ({ kind: "group" as const, id: g.id, label: g.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "it")),
      ...(courses.data ?? [])
        .filter((c) => courseIds.includes(c.id))
        .map((c) => ({ kind: "course" as const, id: c.id, label: c.name })),
    ];
    const choosing = options.length > 1;
    const current = choosing ? (options.find((o) => keyOf(o) === saved) ?? options[0]) : null;
    const scope: StudentMaterialScope = current
      ? {
          courseIds: current.kind === "course" ? [current.id] : [],
          audienceIds: current.kind === "group" ? [uid, current.id] : [uid],
          personal: true,
        }
      : { courseIds, audienceIds: [uid, ...groupIds], personal: true };
    return {
      options: choosing ? options : [],
      current,
      scope,
      ready: profile.isSuccess && (groupIds.length === 0 || !groups.isPending) && !courses.isPending,
      select: (o) => {
        setSaved(keyOf(o));
        try {
          window.localStorage.setItem(storageKey, keyOf(o));
        } catch {
          // archiviazione non disponibile (navigazione privata): la scelta vale per la sessione
        }
      },
    };
  }, [groups.data, groups.isPending, courses.data, courses.isPending, courseIds, groupIds, profile.isSuccess, saved, storageKey, uid]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudentContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudentContext richiede <StudentContextProvider>");
  return ctx;
}
