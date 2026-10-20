"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Download, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/shared/brand";
import { Field } from "@/components/shared/form";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { useSession } from "@/features/auth/auth-provider";
import { profileSchema, type ProfileValues } from "@/features/students/schemas";
import { useMyRoleName } from "@/features/roles/hooks";
import { startInstall, useInstallMode } from "@/lib/pwa";
import { authService } from "@/services/authService";
import { userService } from "@/services/userService";
import { errorMessage } from "@/utils/errors";
import { fullName } from "@/utils/format";

export function ProfileView() {
  const { uid, user, profile, refreshProfile, signOut } = useSession();
  const roleName = useMyRoleName();
  const router = useRouter();
  const installMode = useInstallMode();
  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="Profilo" />
      <AvatarSection uid={uid} profile={profile} onChange={refreshProfile} />
      <p className="-mt-3 text-center text-sm text-muted-foreground">
        {[fullName(profile), roleName].filter(Boolean).join(" · ")}
      </p>
      <PersonalForm uid={uid} defaults={{ name: profile?.name ?? "", surname: profile?.surname ?? "", phone: profile?.phone ?? "" }} onSaved={refreshProfile} />
      <GoogleAccessCard email={authService.googleEmail(user)} />
      <section className="card-surface space-y-2 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-brand-ink" aria-hidden /> Privacy e dati personali
        </h2>
        <p className="text-sm text-muted-foreground">
          I tuoi dati sono visibili solo a te e ai docenti della scuola. Per richiedere l&apos;esportazione o la
          cancellazione dei dati contatta la segreteria.
        </p>
      </section>
      {installMode && (
        <Button className="w-full" onClick={() => startInstall(installMode)}>
          <Download aria-hidden /> Installa app
        </Button>
      )}
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

/** Accesso solo con Google (ADR D33). Gli account precedenti con password lo collegano da qui. */
function GoogleAccessCard({ email }: { email: string | null }) {
  const [linked, setLinked] = useState(email);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="font-semibold">Accesso</h2>
      {linked !== null ? (
        <p className="text-sm text-muted-foreground">
          Accedi con il tuo account Google <strong className="text-foreground">{linked}</strong>. Password e sicurezza
          dell&apos;account si gestiscono da Google.
        </p>
      ) : (
        <>
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            L&apos;accesso con email e password non è più disponibile. Collega ora il tuo account Google: senza, dopo
            essere uscito non potrai più entrare.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await authService.linkGoogle();
                const user = (await authService.currentUser())!;
                setLinked(authService.googleEmail(user) ?? "");
                toast.success("Account Google collegato");
              } catch (e) {
                toast.error(errorMessage(e, "Collegamento con Google non riuscito. Riprova."));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />} Collega account Google
          </Button>
        </>
      )}
    </section>
  );
}
