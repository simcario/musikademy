"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { CourseSelect, StudentSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { useWhatsAppSession, useWhatsAppSettings } from "@/features/whatsapp/hooks";
import { announcementService } from "@/services/announcementService";
import { messageText } from "@/lib/whatsapp/shared";
import { announcementRecipients, whatsappService } from "@/services/whatsappService";
import type { Announcement, WithId } from "@/types";
import { fullName } from "@/utils/format";

const schema = z
  .object({
    title: z.string().trim().min(1, "Inserisci un titolo").max(140),
    content: z.string().trim().min(1, "Scrivi il messaggio").max(10000),
    targetType: z.enum(["all", "course", "student"]),
    targetId: z.string().optional(),
    whatsapp: z.boolean(),
  })
  .refine((v) => v.targetType === "all" || !!v.targetId, { path: ["targetId"], message: "Seleziona il destinatario" });
type Values = z.infer<typeof schema>;

export function AnnouncementFormDialog({
  open,
  onOpenChange,
  announcement,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  announcement?: WithId<Announcement> | null;
}) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={announcement ? "Modifica comunicazione" : "Nuova comunicazione"}>
      <AnnouncementForm key={announcement?.id ?? "new"} announcement={announcement} onDone={() => onOpenChange(false)} />
    </SidePanel>
  );
}

function AnnouncementForm({ announcement, onDone }: { announcement?: WithId<Announcement> | null; onDone: () => void }) {
  const { uid, profile } = useSession();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: announcement?.title ?? "",
      content: announcement?.content ?? "",
      targetType: announcement?.targetType ?? "all",
      targetId: announcement?.targetId ?? "",
      whatsapp: false,
    },
  });
  const { errors } = form.formState;
  const [target, targetId, sendWhatsApp] = useWatch({ control: form.control, name: ["targetType", "targetId", "whatsapp"] });
  const students = useActiveStudents();
  const wa = useWhatsAppSession();
  const waSettings = useWhatsAppSettings().data;
  const zernio = waSettings?.provider === "zernio";
  const recipients = announcementRecipients({ targetType: target, targetId }, students.data ?? []);
  const withoutPhone = recipients.filter((s) => !s.phone).length;

  const save = useStaffMutation(
    async ({ whatsapp, ...v }: Values) => {
      const input = { ...v, targetId: v.targetType === "all" ? undefined : v.targetId };
      const authorName = announcement?.authorName ?? fullName(profile);
      let id = announcement?.id;
      if (id) await announcementService.update(id, input);
      else id = await announcementService.create(input, { uid, name: authorName });
      if (!whatsapp) return 0;
      // Destinatari calcolati al momento dell'invio, sugli studenti attivi.
      const all = students.data ?? (await students.refetch()).data ?? [];
      const queued = await whatsappService.queueAnnouncement(
        { ...input, authorName },
        id,
        announcementRecipients(input, all),
        messageText(waSettings ?? (await whatsappService.getSettings()), "announcement"),
        uid,
      );
      // Con Zernio l'invio avviene sul server: lo avviamo subito. Se non riesce, ci pensa il job pianificato.
      if (zernio && queued) await whatsappService.dispatchNow().catch(() => undefined);
      return queued;
    },
    {
      success: (queued) =>
        `${announcement ? "Comunicazione aggiornata" : "Comunicazione pubblicata"}${queued ? ` · ${queued} messaggi WhatsApp in coda` : ""}`,
      invalidate: [["announcements"]],
      onSuccess: onDone,
    },
  );

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Titolo" error={errors.title?.message} required>
        {(p) => <Input {...p} {...form.register("title")} />}
      </Field>
      <Field label="Messaggio" error={errors.content?.message} required>
        {(p) => <Textarea {...p} rows={6} {...form.register("content")} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Destinatari">
          {(p) => (
            <NativeSelect {...p} {...form.register("targetType", { onChange: () => form.setValue("targetId", "") })}>
              <option value="all">Tutti gli studenti</option>
              <option value="course">Un corso / classe</option>
              <option value="student">Un singolo studente</option>
            </NativeSelect>
          )}
        </Field>
        {target === "course" && (
          <Field label="Corso" error={errors.targetId?.message} required>
            {(p) => <CourseSelect {...p} placeholder="Seleziona corso" {...form.register("targetId")} />}
          </Field>
        )}
        {target === "student" && (
          <Field label="Studente" error={errors.targetId?.message} required>
            {(p) => <StudentSelect {...p} {...form.register("targetId")} />}
          </Field>
        )}
      </div>
      <div className="rounded-lg border border-border p-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-[18px] accent-primary" {...form.register("whatsapp")} />
          {announcement ? "Invia di nuovo anche su WhatsApp" : "Invia anche su WhatsApp"}
        </label>
        {sendWhatsApp && (
          <p className="pl-[30px] text-xs text-muted-foreground">
            {recipients.length === 1 ? "1 studente" : `${recipients.length} studenti`}
            {withoutPhone > 0 && ` (${withoutPhone} senza numero in anagrafica)`}.{" "}
            {zernio
              ? "Invio immediato con l'API ufficiale e il testo approvato (vedi WhatsApp → Testi dei messaggi); il testo lungo viene accorciato."
              : wa.connected
                ? "Invio dal numero collegato, un messaggio ogni pochi secondi."
                : "WhatsApp non è collegato ora: i messaggi partiranno appena lo sarà."}
          </p>
        )}
      </div>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={announcement ? "Salva" : "Pubblica"} />
    </form>
  );
}
