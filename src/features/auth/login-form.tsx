"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { homeFor } from "@/lib/auth/roles";
import { authService } from "@/services/authService";
import { errorMessage } from "@/utils/errors";
import { useAuth } from "./auth-provider";
import { GoogleButton } from "./google-button";
import { safeNext } from "./schemas";

/** Accesso solo con Google (ADR D33): l'account Google si collega la prima volta dal link d'invito. */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, role } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = safeNext(params.get("next"));

  // Già autenticato → vai all'area di competenza.
  useEffect(() => {
    if (status === "signed-in" && role) router.replace(next ?? homeFor(role));
  }, [status, role, next, router]);

  async function onGoogle() {
    setError(null);
    setPending(true);
    try {
      const { role: r } = await authService.signInWithGoogle();
      router.replace(next ?? homeFor(r));
    } catch (e) {
      setError(errorMessage(e, "Accesso con Google non riuscito. Riprova."));
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bentornato</h1>
        <p className="text-sm text-muted-foreground">Accedi per continuare il tuo percorso.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <GoogleButton onClick={onGoogle} pending={pending}>
        Accedi con Google
      </GoogleButton>

      <p className="text-center text-sm text-muted-foreground">
        Primo accesso? Apri il link d&apos;invito che hai ricevuto dalla scuola: collegherà il tuo account Google.
      </p>
    </div>
  );
}
