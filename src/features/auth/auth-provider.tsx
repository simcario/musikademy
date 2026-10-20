"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import type { Access } from "@/lib/auth/roles";
import { authService } from "@/services/authService";
import { userService } from "@/services/userService";
import type { AppUser, Role, WithId } from "@/types";

type AuthStatus = "loading" | "signed-out" | "signed-in" | "no-role";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  role: Role | null;
  /** Ruolo dell'organizzazione e permessi (ADR D31); `null` finché non si è entrati. */
  access: Access | null;
  profile: WithId<AppUser> | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Omit<AuthContextValue, "refreshProfile" | "signOut">>({
    status: "loading",
    user: null,
    role: null,
    access: null,
    profile: null,
  });

  useEffect(() => {
    let cancelled = false;
    // Alla prima lettura il token si rinnova: i permessi cambiati dall'admin valgono già da questo avvio.
    let refreshed: string | null = null;
    const unsubscribe = authService.onChange(async (user) => {
      if (!user) {
        refreshed = null;
        queryClient.clear(); // nessun dato di un utente resta in cache per il successivo
        if (!cancelled) setState({ status: "signed-out", user: null, role: null, access: null, profile: null });
        return;
      }
      try {
        const force = refreshed !== user.uid;
        refreshed = user.uid;
        const access = await authService.accessOf(user, force);
        if (!access) {
          if (!cancelled) setState({ status: "no-role", user, role: null, access: null, profile: null });
          return;
        }
        const profile = await userService.get(user.uid).catch(() => null);
        if (!cancelled) setState({ status: "signed-in", user, role: access.role, access, profile });
      } catch {
        if (!cancelled) setState({ status: "no-role", user, role: null, access: null, profile: null });
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const profile = await userService.get(state.user.uid);
    setState((s) => ({ ...s, profile }));
  }, [state.user]);

  const signOut = useCallback(async () => {
    await authService.signOut();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => ({ ...state, refreshProfile, signOut }), [state, refreshProfile, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}

/** Per le pagine già protette da RoleGate: utente e ruolo sono garantiti. */
export function useSession() {
  const { user, role, access, profile, refreshProfile, signOut } = useAuth();
  if (!user || !role || !access) throw new Error("useSession usato fuori da una route protetta");
  return { uid: user.uid, user, role, access, profile, refreshProfile, signOut };
}
