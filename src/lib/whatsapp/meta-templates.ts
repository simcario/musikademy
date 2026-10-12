import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_META_TEMPLATES,
  MESSAGE_KINDS,
  WA_DEFAULT_SETTINGS,
  WA_DOC,
  metaTemplateName,
  type MessageKind,
  type MetaTemplateRef,
} from "./shared";
import { createTemplate, listTemplates } from "./zernio";

/**
 * Template Meta personalizzabili (ADR D25). Per ogni tipo di messaggio:
 * - `metaTemplates[kind]`: template approvato in uso (assente = predefinito, DEFAULT_META_TEMPLATES)
 * - `metaDrafts[kind]`: testo modificato, inviato a Meta e in attesa di approvazione.
 * Appena Meta approva la bozza, diventa il template in uso: nessun messaggio resta senza testo approvato.
 */

export type Settings = typeof WA_DEFAULT_SETTINGS;
export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "MISSING";

export interface TemplateState extends MetaTemplateRef {
  status: TemplateStatus;
  category?: string;
  reason?: string;
}

export interface KindTemplates {
  kind: MessageKind;
  active: TemplateState;
  draft: TemplateState | null;
}

const settingsRef = () => adminDb().collection("whatsapp").doc(WA_DOC.settings);

export async function loadSettings(): Promise<Settings> {
  const snap = await settingsRef().get();
  return { ...WA_DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) };
}

/** Stato dei template su Meta; promuove le bozze appena approvate. */
export async function resolveTemplates(accountId: string, s: Settings): Promise<Record<MessageKind, KindTemplates>> {
  const existing = await listTemplates(accountId);
  const state = (ref: MetaTemplateRef): TemplateState => {
    const t = existing.find((x) => x.name === ref.name);
    return { ...ref, status: t?.status ?? "MISSING", category: t?.category, reason: t?.rejected_reason };
  };

  const promoted: Record<string, unknown> = {};
  const out = {} as Record<MessageKind, KindTemplates>;
  for (const kind of MESSAGE_KINDS) {
    let active = state(s.metaTemplates?.[kind] ?? DEFAULT_META_TEMPLATES[kind]);
    let draft = s.metaDrafts?.[kind] ? state(s.metaDrafts[kind]!) : null;
    if (draft?.status === "APPROVED") {
      promoted[`metaTemplates.${kind}`] = { name: draft.name, text: draft.text };
      promoted[`metaDrafts.${kind}`] = FieldValue.delete();
      active = draft;
      draft = null;
    }
    out[kind] = { kind, active, draft };
  }
  if (Object.keys(promoted).length) await settingsRef().update({ ...promoted, updatedAt: FieldValue.serverTimestamp() });
  return out;
}

/** Invia a Meta un testo personalizzato come nuovo template (bozza fino all'approvazione). */
export async function submitTemplate(accountId: string, kind: MessageKind, text: string) {
  const name = metaTemplateName(kind);
  await createTemplate(accountId, name, kind, text);
  await settingsRef().set(
    {
      [kind === "reminder" ? "reminderTemplate" : "announcementTemplate"]: text,
      metaDrafts: { [kind]: { name, text } },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Crea su Meta i template predefiniti che mancano (primo collegamento). */
export async function createMissingDefaults(accountId: string, s: Settings) {
  const current = await resolveTemplates(accountId, s);
  for (const kind of MESSAGE_KINDS) {
    const { active } = current[kind];
    const isDefault = active.name === DEFAULT_META_TEMPLATES[kind].name;
    if (isDefault && active.status === "MISSING") await createTemplate(accountId, active.name, kind, active.text);
  }
}
