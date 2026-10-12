"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, RotateCcw, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useStaffMutation } from "@/features/admin/hooks";
import {
  DEFAULT_ANNOUNCEMENT_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  MESSAGE_KINDS,
  MESSAGE_PLACEHOLDERS,
  META_WORDS_PER_VARIABLE,
  messageText,
  renderMessage,
  sampleVars,
  transcode,
  type MessageKind,
} from "@/lib/whatsapp/shared";
import { cn } from "@/lib/utils";
import { whatsappService, type ZernioStatus } from "@/services/whatsappService";
import type { WhatsAppSettings } from "@/types";
import { useWhatsAppSettings, useZernioStatus } from "./hooks";
import { TEMPLATE_LABEL, TEMPLATE_STATUS } from "./whatsapp-panel";

const DEFAULT_TEXT: Record<MessageKind, string> = {
  reminder: DEFAULT_REMINDER_TEMPLATE,
  announcement: DEFAULT_ANNOUNCEMENT_TEMPLATE,
};
const FIELD: Record<MessageKind, "reminderTemplate" | "announcementTemplate"> = {
  reminder: "reminderTemplate",
  announcement: "announcementTemplate",
};
const KIND_HINT: Record<MessageKind, string> = {
  reminder: "Inviato agli studenti prima di ogni lezione, all'orario impostato.",
  announcement: "Inviato a ogni destinatario quando pubblichi una comunicazione con \"Invia anche su WhatsApp\".",
};

/**
 * Testi personalizzabili dei messaggi WhatsApp con segnaposto ({nome}, {titolo}…).
 * Con Zernio il testo viene trascodificato nel formato dei template Meta ({{1}}, {{2}}…) e inviato in approvazione.
 */
export function MessageTemplates({ editable }: { editable: boolean }) {
  const settings = useWhatsAppSettings();
  const zernio = settings.data?.provider === "zernio";
  const status = useZernioStatus(zernio);
  return (
    <section className="card-surface space-y-4 p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileText className="size-5 text-brand-ink" aria-hidden /> Testi dei messaggi
        </h2>
        <p className="text-sm text-muted-foreground">
          {zernio
            ? "Scrivi il testo con i segnaposto: viene trascodificato nel formato di Meta e inviato in approvazione. Finché il nuovo testo non è approvato resta in uso il precedente."
            : "Scrivi il testo con i segnaposto: con WhatsApp Web viene usato subito, così com'è."}
        </p>
      </div>
      {settings.isPending ? (
        <ListSkeleton rows={2} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        MESSAGE_KINDS.map((kind) => (
          <TemplateEditor
            key={`${kind}-${messageText(settings.data, kind)}`}
            kind={kind}
            settings={settings.data}
            zernio={zernio}
            status={status.data?.templates.find((t) => t.kind === kind)}
            editable={editable}
          />
        ))
      )}
    </section>
  );
}

function TemplateEditor({
  kind,
  settings,
  zernio,
  status,
  editable,
}: {
  kind: MessageKind;
  settings: WhatsAppSettings;
  zernio: boolean;
  status?: ZernioStatus["templates"][number];
  editable: boolean;
}) {
  const saved = messageText(settings, kind);
  const [text, setText] = useState(saved);
  const area = useRef<HTMLTextAreaElement>(null);
  const t = transcode(text, kind);
  const placeholders = MESSAGE_PLACEHOLDERS[kind];
  // Con Zernio conta il testo già inviato a Meta (in approvazione o in uso), non solo quello salvato.
  const reference = zernio ? (status?.draft?.text ?? status?.active.text ?? saved) : saved;
  const changed = text.trim() !== reference.trim();
  const blocking = zernio ? t.issues : t.unknown.length ? t.issues.filter((i) => i.startsWith("Segnaposto")) : [];

  const save = useStaffMutation(
    async () => {
      if (zernio) await whatsappService.submitTemplate(kind, text.trim());
      else await whatsappService.saveSettings({ [FIELD[kind]]: text.trim() });
    },
    {
      success: zernio
        ? "Testo inviato a Meta: resta in uso il precedente finché non viene approvato"
        : "Testo salvato",
      invalidate: [["whatsapp"]],
    },
  );

  function insert(key: string) {
    const el = area.current;
    const token = `{${key}}`;
    if (!el) return setText((v) => v + token);
    const { selectionStart: a, selectionEnd: b } = el;
    const next = text.slice(0, a) + token + text.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  }

  const position = new Map<string, number[]>();
  t.order.forEach((key, i) => position.set(key, [...(position.get(key) ?? []), i + 1]));

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{TEMPLATE_LABEL[kind]}</p>
          <p className="text-xs text-muted-foreground">{KIND_HINT[kind]}</p>
        </div>
        {zernio && status && (
          <div className="flex flex-wrap gap-1">
            <Pill tone={TEMPLATE_STATUS[status.active.status].tone}>In uso: {TEMPLATE_STATUS[status.active.status].label}</Pill>
            {status.draft && (
              <Pill tone={TEMPLATE_STATUS[status.draft.status].tone}>
                Nuovo testo: {TEMPLATE_STATUS[status.draft.status].label}
              </Pill>
            )}
          </div>
        )}
      </div>

      <fieldset disabled={!editable || save.isPending} className="space-y-2">
        <legend className="sr-only">Testo: {TEMPLATE_LABEL[kind]}</legend>
        <div className="flex flex-wrap gap-1" aria-label="Inserisci un segnaposto">
          {Object.entries(placeholders).map(([key, p]) => (
            <button
              key={key}
              type="button"
              title={p.label}
              onClick={() => insert(key)}
              className="rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs hover:bg-muted"
            >
              {`{${key}}`}
            </button>
          ))}
        </div>
        <Textarea
          ref={area}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Testo: ${TEMPLATE_LABEL[kind]}`}
          aria-invalid={blocking.length ? true : undefined}
        />
      </fieldset>

      {t.issues.length > 0 && (
        <ul
          className={cn(
            "list-disc space-y-0.5 rounded-lg p-3 pl-7 text-xs",
            blocking.length ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
          )}
          role={blocking.length ? "alert" : undefined}
        >
          {t.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
          {!zernio && !blocking.length && <li>Con WhatsApp Web va bene, ma con l&apos;API ufficiale Meta lo rifiuterebbe.</li>}
        </ul>
      )}

      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <p className="section-label mb-1 text-muted-foreground">Anteprima</p>
        <p className="whitespace-pre-wrap">{renderMessage(text, sampleVars(kind)) || "—"}</p>
      </div>

      <details className="rounded-lg border border-border text-sm" open={zernio}>
        <summary className="cursor-pointer px-3 py-2 font-medium">Trascodifica dei segnaposto</summary>
        <div className="space-y-3 border-t border-border p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Segnaposto</th>
                  <th className="py-1 pr-3 font-medium">Variabile Meta</th>
                  <th className="py-1 pr-3 font-medium">Significato</th>
                  <th className="py-1 font-medium">Esempio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(placeholders).map(([key, p]) => {
                  const nums = position.get(key);
                  return (
                    <tr key={key} className={nums ? "" : "text-muted-foreground"}>
                      <td className="py-1 pr-3 font-mono">{`{${key}}`}</td>
                      <td className="py-1 pr-3 font-mono">{nums ? nums.map((n) => `{{${n}}}`).join(", ") : "non usato"}</td>
                      <td className="py-1 pr-3">{p.label}</td>
                      <td className="py-1">{p.example}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <p className="section-label mb-1 text-muted-foreground">Testo inviato a Meta</p>
            <p className="rounded bg-muted/60 p-2 font-mono text-xs whitespace-pre-wrap">{t.body || "—"}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Regole di Meta: il testo non può iniziare o finire con un segnaposto, due segnaposto vanno separati da almeno
            una parola e servono almeno {META_WORDS_PER_VARIABLE} parole fisse per ogni segnaposto. Nei valori gli a capo
            diventano &quot; · &quot;.
          </p>
        </div>
      </details>

      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={text === DEFAULT_TEXT[kind] || save.isPending}
            onClick={() => setText(DEFAULT_TEXT[kind])}
          >
            <RotateCcw aria-hidden /> Testo predefinito
          </Button>
          <Button type="button" size="sm" disabled={!changed || blocking.length > 0 || save.isPending} onClick={() => save.mutate(undefined)}>
            {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : zernio ? <Send aria-hidden /> : <Save aria-hidden />}
            {zernio ? "Invia a Meta per l'approvazione" : "Salva testo"}
          </Button>
        </div>
      )}
    </div>
  );
}
