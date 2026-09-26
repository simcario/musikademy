"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/shared/brand";
import { Field } from "@/components/shared/form";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { useSession } from "@/features/auth/auth-provider";
import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailValues,
  type ChangePasswordValues,
} from "@/features/auth/schemas";
import { profileSchema, type ProfileValues } from "@/features/students/schemas";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { authService } from "@/services/authService";
import { userService } from "@/services/userService";
import { errorMessage } from "@/utils/errors";
import { fullName } from "@/utils/format";

export function ProfileView() {
  const { uid, user, role, profile, refreshProfile, signOut } = useSession();
  const router = useRouter();
  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="Profilo" />
      <AvatarSection uid={uid} profile={profile} onChange={refreshProfile} />
      <p className="-mt-3 text-center text-sm text-muted-foreground">
        {fullName(profile)} · {role ? ROLE_LABEL[role] : ""}
      </p>
      <PersonalForm uid={uid} defaults={{ name: profile?.name ?? "", surname: profile?.surname ?? "", phone: profile?.phone ?? "" }} onSaved={refreshProfile} />
      {authService.hasPassword(user) ? (
        <>
          <EmailForm current={user.email ?? ""} />
          <PasswordForm />
        </>
      ) : (
        <GoogleAccessCard email={user.providerData.find((p) => p.providerId === "google.com")?.email ?? user.email ?? ""} />
      )}
      <section className="card-surface space-y-2 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-brand-ink" aria-hidden /> Privacy e dati personali
        </h2>
        <p className="text-sm text-muted-foreground">
          I tuoi dati sono visibili solo a te e ai docenti della scuola. Per richiedere l&apos;esportazione o la
          cancellazione dei dati contatta la segreteria.
        </p>
      </section>
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          await signOut();
          router.replace("/login");
        }}
      >
        <LogOut aria-hidden /> Esci
      </Button>
    </PageContainer>
  );

}
function AvatarSection({
  uid,
  profile,
  onChange,
}: {
  uid: string;
  profile: { name?: string; surname?: string; photoURL?: string } | null;
  onChange: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <UserAvatar person={profile} size="xl" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label="Cambia foto profilo"
          className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            await userService.uploadAvatar(uid, file);
            await onChange();
            toast.success("Foto aggiornata");
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function PersonalForm({ uid, defaults, onSaved }: { uid: string; defaults: ProfileValues; onSaved: () => Promise<void> }) {
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { errors, isSubmitting, isDirty } = form.formState;
  return (
    <form
      className="card-surface space-y-4 p-4"
      noValidate
      onSubmit={form.handleSubmit(async (v) => {
        try {
          await userService.updateProfile(uid, { name: v.name, surname: v.surname, phone: v.phone || "" });
          await onSaved();
          form.reset(v);
          toast.success("Profilo aggiornato");
        } catch (e) {
          toast.error(errorMessage(e));
        }
      })}
    >
      <h2 className="font-semibold">Dati personali</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" error={errors.name?.message} required>
          {(p) => <Input {...p} autoComplete="given-name" {...form.register("name")} />}
        </Field>
        <Field label="Cognome" error={errors.surname?.message} required>
          {(p) => <Input {...p} autoComplete="family-name" {...form.register("surname")} />}
        </Field>
      </div>
      <Field label="Telefono" error={errors.phone?.message}>
        {(p) => <Input {...p} type="tel" autoComplete="tel" {...form.register("phone")} />}
      </Field>
      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden />} Salva
      </Button>
    </form>
  );
}

function GoogleAccessCard({ email }: { email: string }) {
  return (
    <section className="card-surface space-y-1 p-4">
      <h2 className="font-semibold">Accesso</h2>
      <p className="text-sm text-muted-foreground">
        Accedi con il tuo account Google <strong className="text-foreground">{email}</strong>. Password e sicurezza
        dell&apos;account si gestiscono da Google.
      </p>
    </section>
  );
}

function EmailForm({ current }: { current: string }) {
  const form = useForm<ChangeEmailValues>({ resolver: zodResolver(changeEmailSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      className="card-surface space-y-4 p-4"
      noValidate
      onSubmit={form.handleSubmit(async (v) => {
        try {
          await authService.changeEmail(v.email, v.password);
          form.reset();
          toast.success("Ti abbiamo inviato un link di conferma al nuovo indirizzo.");
        } catch (e) {
          toast.error(errorMessage(e));
        }
      })}
    >
      <div>
        <h2 className="font-semibold">Email di accesso</h2>
        <p className="text-sm text-muted-foreground">Attuale: {current}</p>
      </div>
      <Field label="Nuova email" error={errors.email?.message}>
        {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
      </Field>
      <Field label="Password attuale" error={errors.password?.message} hint="Richiesta per sicurezza.">
        {(p) => <Input {...p} type="password" autoComplete="current-password" {...form.register("password")} />}
      </Field>
      <Button type="submit" variant="secondary" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden />} Cambia email
      </Button>
    </form>
  );
}

function PasswordForm() {
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      className="card-surface space-y-4 p-4"
      noValidate
      onSubmit={form.handleSubmit(async (v) => {
        try {
          await authService.changePassword(v.current, v.next);
          form.reset();
          toast.success("Password aggiornata");
        } catch (e) {
          toast.error(errorMessage(e));
        }
      })}
    >
      <h2 className="font-semibold">Password</h2>
      <Field label="Password attuale" error={errors.current?.message}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" {...form.register("current")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nuova password" error={errors.next?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("next")} />}
        </Field>
        <Field label="Conferma" error={errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("confirm")} />}
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden />} Aggiorna password
      </Button>
    </form>
  );
}
