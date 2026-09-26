"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form";
import { homeFor } from "@/lib/auth/roles";
import { authService } from "@/services/authService";
import { errorMessage } from "@/utils/errors";
import { useAuth } from "./auth-provider";
import { GoogleButton } from "./google-button";
import { loginSchema, safeNext, type LoginValues } from "./schemas";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, role } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const next = safeNext(params.get("next"));

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  // Già autenticato → vai all'area di competenza.
  useEffect(() => {
    if (status === "signed-in" && role) router.replace(next ?? homeFor(role));
  }, [status, role, next, router]);

  const [googlePending, setGooglePending] = useState(false);
  async function onGoogle() {
    setError(null);
    setGooglePending(true);
    try {
      const { role: r } = await authService.signInWithGoogle();
      router.replace(next ?? homeFor(r));
    } catch (e) {
      setError(errorMessage(e, "Accesso con Google non riuscito. Riprova."));
      setGooglePending(false);
    }
  }

  async function onSubmit(values: LoginValues) {
    setError(null);
    try {
      const user = await authService.signIn(values.email, values.password);
      const r = await authService.roleOf(user, true);
      router.replace(r ? (next ?? homeFor(r)) : "/");
    } catch (e) {
      setError(errorMessage(e, "Accesso non riuscito. Riprova."));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bentornato</h1>
        <p className="text-sm text-muted-foreground">Accedi per continuare il tuo percorso.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <GoogleButton onClick={onGoogle} pending={googlePending}>
        Accedi con Google
      </GoogleButton>

      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" /> oppure con email <span className="h-px flex-1 bg-border" />
      </div>

      <Field label="Email" error={errors.email?.message} required>
        {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
      </Field>

      <Field label="Password" error={errors.password?.message} required>
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="pr-12"
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute top-0 right-0 flex h-full w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Nascondi password" : "Mostra password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        )}
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        Accedi
      </Button>

      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-brand-ink hover:underline">
          Password dimenticata?
        </Link>
      </p>
    </form>
  );
}
