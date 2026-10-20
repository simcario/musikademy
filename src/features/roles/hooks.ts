"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { qk } from "@/hooks/query-keys";
import { SYSTEM_ROLES, isSystemRole, type RoleKind } from "@/lib/auth/roles";
import { roleService } from "@/services/roleService";

/** Tutti i ruoli dell'organizzazione (ADR D31). */
export function useRoles() {
  return useQuery({ queryKey: qk.roles(), queryFn: roleService.list, staleTime: 10 * 60_000 });
}

/** Ruoli di un tipo: quelli dell'area personale o quelli dello staff. */
export function useRolesOfKind(kind: RoleKind) {
  const q = useRoles();
  return { ...q, data: q.data?.filter((r) => r.kind === kind) };
}

/** Nome del ruolo, con ripiego sui ruoli di sistema finché l'elenco non è caricato. */
export function useRoleName(roleId: string | undefined | null): string {
  const roles = useRoles().data;
  if (!roleId) return "";
  return roles?.find((r) => r.id === roleId)?.name ?? (isSystemRole(roleId) ? SYSTEM_ROLES[roleId].name : "");
}

/** Nome del ruolo della sessione corrente. */
export function useMyRoleName(): string {
  const { access } = useAuth();
  return useRoleName(access?.roleId ?? access?.role);
}