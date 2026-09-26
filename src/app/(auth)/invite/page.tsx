"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { GoogleButton } from "@/features/auth/google-button";
import { homeFor } from "@/lib/auth/roles";
import { isInviteToken } from "@/lib/auth/invite-token";
import { cn } from "@/lib/utils";
import { authService } from "@/services/authService";
import { errorMessage } from "@/utils/errors";

type State =
  | { step: "loading" }
  | { step: "signed-in-other"; email: string }
  | { step: "ready"; name: string }
  | { step: "invalid"; message: string };

/**
 * Accettazione invito: `/invite#<token>`. Il token è nel frammento, quindi non arriva mai
 * al server se non nel corpo delle chiamate API (niente log di accesso, niente Referer).
 */
export default function InvitePage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "loading" });
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const started = useRef(false);

  const open = useCallback(async () => {
    setState({ step: "loading" });
    const t = window.location.hash.slice(1);
    if (!isInviteToken(t)) {
      setState({ step: "invalid", message: "Link d'invito non valido: controlla di averlo copiato per intero." });
      return;
    }
    token.current = t;
    const current = await authService.currentUser();
    if (current) {
      setState({ step: "signed-in-other", email: current.email ?? "un altro account" });
      return;
    }
    try {
      const { name } = await authService.openInvite(t);
      setState({ step: "ready", name });
    } catch (e) {
      setState({ step: "invalid", message: errorMessage(e, "Link d'invito non valido.") });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
  }, [open]);

  async function link() {
    setError(null);
    setLinking(true);
    try {
      const role = await authService.completeInvite(token.current!);
      router.replace(homeFor(role));
    } catch (e) {
      setError(errorMessage(e, "Collegamento con Google non riuscito. Riprova."));
      setLinking(false);
    }
  }

  if (state.step === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-6 animate-spin" aria-hidden /> Verifica dell&apos;invito…
      </div>
    );
  }

  if (state.step === "invalid") {
    return (
      <div className="space-y-4 text-center" role="alert">
        <CircleAlert className="mx-auto size-10 text-warning" aria-hidden />
        <h1 className="text-xl font-semibold">Invito non utilizzabile</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          Vai alla pagina di accesso
        </Link>
      </div>
    );
  }

  if (state.step === "signed-in-other") {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">Sei già connesso</h1>
        <p className="text-sm text-muted-foreground">
          Hai già effettuato l&apos;accesso come <strong>{state.email}</strong>. Esci per accettare questo invito.
        </p>
        <Button
          className="w-full"
          onClick={async () => {
            await authService.signOut();
            await open();
          }}
        >
          Esci e continua
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{state.name ? `Ciao ${state.name}!` : "Benvenuto!"}</h1>
        <p className="text-sm text-muted-foreground">
          Sei stato invitato su VOCALIA. Collega il tuo account Google: da quel momento accederai sempre con il
          pulsante «Accedi con Google».
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <GoogleButton onClick={link} pending={linking}>
        Collega il tuo account Google
      </GoogleButton>
      <p className="text-center text-xs text-muted-foreground">
        Useremo solo nome ed email del tuo account Google per farti accedere.
      </p>
    </div>
  );
}
