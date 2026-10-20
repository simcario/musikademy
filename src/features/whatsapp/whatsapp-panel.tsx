"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlarmClock,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileCheck2,
  Loader2,
  LogOut,
  MessageCircle,
  PlugZap,
  RotateCw,
  Send,
  RefreshCw,
  ServerOff,
  Smartphone,
  Trash2,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { WA_PROVIDERS, messageText, normalizePhone, type MessageKind, type WhatsAppProvider } from "@/lib/whatsapp/shared";
import { whatsappService, type ZernioTemplateState } from "@/services/whatsappService";
import type { WhatsAppMessage, WhatsAppMessageKind, WhatsAppMessageStatus, WhatsAppSettings, WithId } from "@/types";
import type { Tone } from "@/utils/status";
import { formatDate } from "@/utils/format";
import { useWhatsAppMessages, useWhatsAppSession, useWhatsAppSettings, useZernioStatus } from "./hooks";

const formatPhone = (p?: string | null) => (p ? `+${p}` : "");

// ─────────────── Collegamento ───────────────

export function WhatsAppConnection({ editable }: { editable: boolean }) {
  const { uid } = useSession();
  const { session, online, loading, error } = useWhatsAppSession();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const command = useStaffMutation((c: "connect" | "logout") => whatsappService.sendCommand(c, uid), {
    invalidate: [],
    onSuccess: () => setConfirmLogout(false),
  });

  let content: React.ReactNode;
  if (loading) {
    content = <Skeleton className="h-24 w-full" />;
  } else if (error) {
    content = <ErrorState error={error} />;
  } else if (!online) {
    content = (
      <Status icon={ServerOff} tone="warning" title="Servizio WhatsApp non attivo">
        Il worker che tiene aperto WhatsApp Web non risponde. Avvialo sul computer della scuola con{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run whatsapp</code>: questa pagina si aggiorna da sola.
        {session?.phone && <> Ultimo numero collegato: {formatPhone(session.phone)}.</>}
      </Status>
    );
  } else if (session?.state === "connected") {
    content = (
      <Status icon={CheckCircle2} tone="success" title={`Collegato a ${formatPhone(session.phone)}`}>
        {session.pushName ? `Profilo "${session.pushName}". ` : ""}Comunicazioni e promemoria partono da questo numero.
        {editable && (
          <Button variant="outline" size="sm" className="mt-3 flex" onClick={() => setConfirmLogout(true)}>
            <LogOut aria-hidden /> Scollega numero
          </Button>
        )}
      </Status>
    );
  } else if (session?.state === "qr" && session.qr) {
    content = (
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- QR generato dal worker (data URL) */}
        <img
          src={session.qr}
          alt="Codice QR per collegare WhatsApp"
          className="size-56 shrink-0 rounded-lg border border-border bg-white p-2"
        />
        <div className="space-y-2 text-sm">
          <p className="font-semibold">Collega il telefono della scuola</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Apri WhatsApp sul telefono</li>
            <li>
              Vai in <strong>Impostazioni → Dispositivi collegati</strong>
            </li>
            <li>
              Tocca <strong>Collega un dispositivo</strong> e inquadra il codice
            </li>
          </ol>
          {session.browserVisible && (
            <p className="text-xs text-muted-foreground">
              Lo stesso codice è nella finestra di WhatsApp Web aperta sul computer del worker.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Il codice si rinnova da solo ogni 20 secondi circa.</p>
        </div>
      </div>
    );
  } else if (session?.state === "starting" || session?.state === "authenticated") {
    content = (
      <Status icon={Loader2} spin tone="info" title={session.state === "starting" ? "Apertura di WhatsApp Web…" : "Accesso eseguito, caricamento…"}>
        Attendi qualche secondo.
      </Status>
    );
  } else {
    content = (
      <Status icon={Smartphone} tone="neutral" title="Nessun numero collegato">
        {session?.error ? `${session.error} ` : ""}
        {editable ? "Avvia il collegamento e scansiona il QR con il telefono della scuola." : "Chiedi all'amministratore di collegare il numero."}
        {editable && (
          <Button size="sm" className="mt-3 flex" disabled={command.isPending} onClick={() => command.mutate("connect")}>
            {command.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />} Collega WhatsApp
          </Button>
        )}
      </Status>
    );
  }

  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <MessageCircle className="size-5 text-brand-ink" aria-hidden /> Collegamento
      </h2>
      {content}
      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Scollegare WhatsApp?"
        description="I messaggi in coda resteranno in attesa finché non colleghi di nuovo un numero (servirà un nuovo QR)."
        confirmLabel="Scollega"
        destructive
        loading={command.isPending}
        onConfirm={() => command.mutate("logout")}
      />
    </section>
  );
}

function Status({
  icon: Icon,
  tone,
  title,
  spin,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  title: string;
  spin?: boolean;
  children?: React.ReactNode;
}) {
  const color: Partial<Record<Tone, string>> = {
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
    neutral: "text-muted-foreground",
  };
  return (
    <div className="flex gap-3" role="status">
      <Icon className={`mt-0.5 size-5 shrink-0 ${color[tone] ?? ""} ${spin ? "animate-spin" : ""}`} aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

// ─────────────── Promemoria ───────────────

const settingsSchema = z.object({
  remindersEnabled: z.boolean(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido"),
  daysBefore: z.coerce.number<string>().int().min(0).max(7),
  countryCode: z.string().trim().regex(/^[1-9]\d{0,3}$/, "Solo cifre, es. 39"),
});
type SettingsValues = z.output<typeof settingsSchema>;
type SettingsInput = z.input<typeof settingsSchema>;

const DAYS_BEFORE_LABEL: Record<number, string> = {
  0: "Il giorno stesso della lezione",
  1: "Il giorno prima",
  2: "Due giorni prima",
};

export function ReminderSettings({ editable }: { editable: boolean }) {
  const q = useWhatsAppSettings();
  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <AlarmClock className="size-5 text-brand-ink" aria-hidden /> Promemoria delle lezioni
      </h2>
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ReminderForm settings={q.data} editable={editable} />
      )}
    </section>
  );
}

function ReminderForm({ settings, editable }: { settings: WhatsAppSettings; editable: boolean }) {
  const form = useForm<SettingsInput, unknown, SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      remindersEnabled: settings.remindersEnabled,
      reminderTime: settings.reminderTime,
      daysBefore: String(settings.daysBefore),
      countryCode: settings.countryCode,
    },
  });
  const { errors, isDirty } = form.formState;
  const [enabled, daysBefore, time] = useWatch({
    control: form.control,
    name: ["remindersEnabled", "daysBefore", "reminderTime"],
  });
  const save = useStaffMutation((v: SettingsValues) => whatsappService.saveSettings(v), {
    success: "Impostazioni dei promemoria salvate",
    invalidate: [["whatsapp", "settings"]],
    onSuccess: (_, v) => form.reset({ ...v, daysBefore: String(v.daysBefore) }),
  });

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <fieldset disabled={!editable} className="space-y-4">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-[18px] accent-primary" {...form.register("remindersEnabled")} />
          Invia un promemoria WhatsApp agli studenti prima di ogni lezione
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quando" hint="Solo le lezioni in programma (non annullate).">
            {(p) => (
              <NativeSelect {...p} {...form.register("daysBefore")}>
                {Object.entries(DAYS_BEFORE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Orario di invio" error={errors.reminderTime?.message} hint="Ora italiana." required>
            {(p) => <Input {...p} type="time" {...form.register("reminderTime")} />}
          </Field>
        </div>
        <Field
          label="Prefisso internazionale predefinito"
          error={errors.countryCode?.message}
          hint="Aggiunto ai numeri degli studenti scritti senza + (es. 39 per l'Italia)."
          className="max-w-xs"
        >
          {(p) => <Input {...p} inputMode="numeric" {...form.register("countryCode")} />}
        </Field>
      </fieldset>
      <p className="text-xs text-muted-foreground">Il testo del promemoria si modifica in &quot;Testi dei messaggi&quot;.</p>
      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {enabled
              ? `Ogni giorno alle ${time || "—"}: ${DAYS_BEFORE_LABEL[Number(daysBefore)]?.toLowerCase() ?? ""}.`
              : "Promemoria disattivati."}
          </p>
          <Button type="submit" disabled={save.isPending || !isDirty}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />} Salva
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Le impostazioni sono gestite dall&apos;amministratore.</p>
      )}
    </form>
  );
}

// ─────────────── Registro invii ───────────────

const STATUS_META: Record<WhatsAppMessageStatus, { label: string; tone: Tone }> = {
  queued: { label: "In coda", tone: "info" },
  sending: { label: "In invio", tone: "info" },
  sent: { label: "Inviato", tone: "success" },
  failed: { label: "Non inviato", tone: "danger" },
  expired: { label: "Scaduto", tone: "neutral" },
};
const KIND_LABEL: Record<WhatsAppMessageKind, string> = {
  announcement: "Comunicazione",
  reminder: "Promemoria",
  test: "Prova",
};

export function WhatsAppMessageLog() {
  // Il docente vede i propri messaggi; le prove verso un numero libero sono dell'admin (ADR D34).
  const isAdmin = useSession().role === "admin";
  const q = useWhatsAppMessages(30);
  const [toDelete, setToDelete] = useState<WithId<WhatsAppMessage> | null>(null);
  const zernio = useWhatsAppSettings().data?.provider === "zernio";
  const retry = useStaffMutation(
    async (id: string) => {
      await whatsappService.retry(id);
      if (zernio) await whatsappService.dispatchNow().catch(() => undefined);
    },
    { success: "Messaggio rimesso in coda", invalidate: [] },
  );
  const remove = useStaffMutation((id: string) => whatsappService.remove(id), {
    success: "Messaggio eliminato",
    invalidate: [],
    onSuccess: () => setToDelete(null),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{isAdmin ? "Ultimi messaggi" : "I tuoi ultimi messaggi"}</h2>
      {isAdmin && <TestMessage />}
      {q.loading ? (
        <ListSkeleton rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data?.length ? (
        <EmptyState icon={MessageCircle} title="Nessun messaggio" description="Qui trovi lo stato di comunicazioni e promemoria inviati su WhatsApp." />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {q.data.map((m) => (
            <li key={m.id} className="flex gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold">{m.recipientName}</p>
                  <Pill tone={STATUS_META[m.status].tone} dot>
                    {STATUS_META[m.status].label}
                  </Pill>
                </div>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[m.kind]} · {formatDate(m.sentAt ?? m.createdAt, "d MMM, HH:mm")}
                  {m.to ? ` · +${m.to}` : ""}
                </p>
                <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{m.body}</p>
                {m.error && m.status !== "sent" && <p className="text-xs font-medium text-danger">{m.error}</p>}
              </div>
              <div className="flex shrink-0 items-start gap-1">
                {m.status === "failed" && (
                  <Button variant="ghost" size="icon" aria-label="Riprova" disabled={retry.isPending} onClick={() => retry.mutate(m.id)}>
                    <RotateCw className="size-4" aria-hidden />
                  </Button>
                )}
                {m.status !== "sending" && (
                  <Button variant="ghost" size="icon" aria-label={m.status === "queued" ? "Annulla invio" : "Elimina"} onClick={() => setToDelete(m)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete?.status === "queued" ? "Annullare l'invio?" : "Eliminare dal registro?"}
        description={toDelete?.status === "queued" ? "Il messaggio non verrà inviato." : "Il messaggio già inviato resta sul telefono dello studente."}
        confirmLabel={toDelete?.status === "queued" ? "Annulla invio" : "Elimina"}
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </section>
  );
}

function TestMessage() {
  const { uid } = useSession();
  const settings = useWhatsAppSettings();
  const [phone, setPhone] = useState("");
  const to = normalizePhone(phone, settings.data?.countryCode);
  const send = useStaffMutation(
    async (n: string) => {
      await whatsappService.queueTest(n, messageText(settings.data ?? {}, "announcement"), uid);
      // Con Zernio parte subito dal server; con WhatsApp Web lo invia il worker.
      if (settings.data?.provider === "zernio") await whatsappService.dispatchNow().catch(() => undefined);
    },
    { success: "Messaggio di prova in coda", invalidate: [], onSuccess: () => setPhone("") },
  );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (to) send.mutate(to);
      }}
    >
      <Field label="Invia un messaggio di prova" hint={phone && !to ? "Numero non valido" : undefined} className="min-w-0 flex-1">
        {(p) => <Input {...p} type="tel" placeholder="333 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />}
      </Field>
      <Button type="submit" variant="secondary" disabled={!to || send.isPending}>
        <Send aria-hidden /> Prova
      </Button>
    </form>
  );
}

// ─────────────── Servizio di invio ───────────────

const PROVIDER_META: Record<WhatsAppProvider, { label: string; description: string }> = {
  "whatsapp-web": {
    label: "WhatsApp Web",
    description: "Gratuito, testo libero. Richiede un computer sempre acceso con il worker; non è un'API ufficiale.",
  },
  zernio: {
    label: "API ufficiale (Zernio)",
    description: "Nessun computer acceso, invio dal server con template approvati da Meta. Pochi centesimi a messaggio.",
  },
};

export function ProviderSettings({ editable }: { editable: boolean }) {
  const q = useWhatsAppSettings();
  const save = useStaffMutation(
    (provider: WhatsAppProvider) => whatsappService.saveSettings({ provider }),
    { success: "Servizio di invio aggiornato", invalidate: [["whatsapp"]] },
  );
  if (!q.data) return null;
  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Cloud className="size-5 text-brand-ink" aria-hidden /> Servizio di invio
      </h2>
      <fieldset disabled={!editable || save.isPending} className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Servizio di invio</legend>
        {WA_PROVIDERS.map((p) => (
          <label
            key={p}
            className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-indigo-soft/40"
          >
            <input
              type="radio"
              name="wa-provider"
              className="mt-0.5 size-[18px] accent-primary"
              checked={q.data.provider === p}
              onChange={() => save.mutate(p)}
            />
            <span>
              <span className="block font-semibold">{PROVIDER_META[p].label}</span>
              <span className="text-xs text-muted-foreground">{PROVIDER_META[p].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {!editable && <p className="text-xs text-muted-foreground">Il servizio è scelto dall&apos;amministratore.</p>}
    </section>
  );
}

// ─────────────── Zernio (API ufficiale) ───────────────

export const TEMPLATE_STATUS: Record<ZernioTemplateState["status"], { label: string; tone: Tone }> = {
  APPROVED: { label: "Approvato", tone: "success" },
  PENDING: { label: "In approvazione", tone: "warning" },
  REJECTED: { label: "Rifiutato", tone: "danger" },
  MISSING: { label: "Da creare", tone: "neutral" },
};
export const TEMPLATE_LABEL: Record<MessageKind, string> = { reminder: "Promemoria lezione", announcement: "Comunicazione" };

export function ZernioConnection({ editable }: { editable: boolean }) {
  const q = useZernioStatus(true);
  const create = useStaffMutation(() => whatsappService.createDefaultTemplates(), {
    success: "Template inviati a Meta: l'approvazione richiede da pochi minuti a 24 ore",
    invalidate: [["whatsapp", "zernio"]],
  });
  const st = q.data;

  let content: React.ReactNode;
  if (q.isPending) content = <Skeleton className="h-24 w-full" />;
  else if (q.isError) content = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else if (!st?.configured)
    content = (
      <Status icon={ServerOff} tone="warning" title="Zernio non configurato">
        Manca la chiave <code className="rounded bg-muted px-1 py-0.5 text-xs">ZERNIO_API_KEY</code> sul server (vedi README).
      </Status>
    );
  else if (st.error) content = <ErrorState error={new Error(`Zernio: ${st.error}`)} onRetry={() => q.refetch()} />;
  else if (!st.account)
    content = (
      <Status icon={Smartphone} tone="neutral" title="Nessun numero WhatsApp collegato su Zernio">
        Collega il numero della scuola (o acquistane uno) dalla dashboard di Zernio, poi aggiorna questa scheda.
        <a
          href="https://zernio.com"
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-1 font-semibold text-brand-ink hover:underline"
        >
          Apri Zernio <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </Status>
    );
  else {
    const { account, templates } = st;
    const phone = account.phone ? ` (${formatPhone(account.phone)})` : "";
    content = (
      <div className="space-y-4">
        <Status
          icon={account.needsReconnection ? ServerOff : CheckCircle2}
          tone={account.needsReconnection ? "warning" : "success"}
          title={`Collegato: ${account.name}${phone}`}
        >
          {account.needsReconnection
            ? "Zernio chiede di ricollegare il numero dalla sua dashboard."
            : "Comunicazioni e promemoria partono da questo numero tramite l'API ufficiale di WhatsApp."}
        </Status>
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FileCheck2 className="size-4 text-brand-ink" aria-hidden /> Template dei messaggi
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {templates.map(({ kind, active, draft }) => (
              <li key={kind} className="space-y-1 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{TEMPLATE_LABEL[kind]}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      In uso: {active.name}
                      {active.category && active.category !== "UTILITY" ? ` · categoria ${active.category} (costo più alto)` : ""}
                    </span>
                  </span>
                  <Pill tone={TEMPLATE_STATUS[active.status].tone}>{TEMPLATE_STATUS[active.status].label}</Pill>
                </div>
                {draft && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">Nuovo testo: {draft.name}</span>
                    <Pill tone={TEMPLATE_STATUS[draft.status].tone}>{TEMPLATE_STATUS[draft.status].label}</Pill>
                  </div>
                )}
                {(draft?.status === "REJECTED" ? draft : active.status === "REJECTED" ? active : null) && (
                  <p className="text-xs text-danger">
                    Rifiutato da Meta{(draft ?? active).reason ? ` (${(draft ?? active).reason})` : ""}: modifica il testo in
                    &quot;Testi dei messaggi&quot; e invialo di nuovo.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {templates.some((t) => t.active.status !== "APPROVED") && (
            <p className="text-xs text-muted-foreground">
              I messaggi partono solo con un template approvato da Meta: fino ad allora restano in coda.
            </p>
          )}
          {editable && templates.some((t) => t.active.status === "MISSING") && (
            <Button size="sm" disabled={create.isPending} onClick={() => create.mutate(undefined)}>
              {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Invia i
              template a Meta
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="card-surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageCircle className="size-5 text-brand-ink" aria-hidden /> Collegamento (Zernio)
        </h2>
        <Button variant="ghost" size="icon" aria-label="Aggiorna stato" disabled={q.isFetching} onClick={() => q.refetch()}>
          <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} aria-hidden />
        </Button>
      </div>
      {content}
      {st?.configured && !st.cronConfigured && (
        <p className="rounded-lg bg-warning-soft p-3 text-xs text-warning">
          Invio automatico non configurato: senza <code>CRON_SECRET</code> e il job di Cloud Scheduler i promemoria non
          partono (le comunicazioni sì). Vedi README.
        </p>
      )}
    </section>
  );
}
