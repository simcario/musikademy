"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { useStaffMutation } from "@/features/admin/hooks";
import { CourseSelect, StudentSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { announcementService } from "@/services/announcementService";
import type { Announcement, WithId } from "@/types";
import { fullName } from "@/utils/format";

const schema = z
  .object({
    title: z.string().trim().min(1, "Inserisci un titolo").max(140),
    content: z.string().trim().min(1, "Scrivi il messaggio").max(10000),
    targetType: z.enum(["all", "course", "student"]),
    targetId: z.string().optional(),
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
    <FormDialog open={open} onOpenChange={onOpenChange} title={announcement ? "Modifica comunicazione" : "Nuova comunicazione"}>
      <AnnouncementForm key={announcement?.id ?? "new"} announcement={announcement} onDone={() => onOpenChange(false)} />
    </FormDialog>
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
    },
  });
  const { errors } = form.formState;
  const target = useWatch({ control: form.control, name: "targetType" });

  const save = useStaffMutation(
    async (v: Values) => {
      const input = { ...v, targetId: v.targetType === "all" ? undefined : v.targetId };
      if (announcement) await announcementService.update(announcement.id, input);
      else await announcementService.create(input, { uid, name: fullName(profile) });
    },
    { success: announcement ? "Comunicazione aggiornata" : "Comunicazione pubblicata", invalidate: [["announcements"]], onSuccess: onDone },
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
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={announcement ? "Salva" : "Pubblica"} />
    </form>
  );
}
