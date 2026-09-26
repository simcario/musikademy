"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form";
import { forgotSchema, type ForgotValues } from "@/features/auth/schemas";
import { authService } from "@/services/authService";
import { errorMessage } from "@/utils/errors";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  async function onSubmit({ email }: ForgotValues) {
    setError(null);
    try {
      await authService.sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      const code = (e as { code?: string }).code;
      // Non rivelare se l'email esiste: stessa risposta in caso di utente inesistente.
      if (code === "auth/user-not-found") setSent(true);
      else setError(errorMessage(e));
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center" role="status">
        <MailCheck className="mx-auto size-10 text-success" aria-hidden />
        <h1 className="text-xl font-semibold">Controlla la tua email</h1>
        <p className="text-sm text-muted-foreground">
          Se l&apos;indirizzo è registrato, riceverai un link per impostare una nuova password.
        </p>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          Torna all&apos;accesso
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Password dimenticata</h1>
        <p className="text-sm text-muted-foreground">Ti invieremo un link per reimpostarla.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Field label="Email" error={form.formState.errors.email?.message} required>
        {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        Invia link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Torna all&apos;accesso
        </Link>
      </p>
    </form>
  );
}
