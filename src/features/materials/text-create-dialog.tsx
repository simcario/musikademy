"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { materialService } from "@/services/materialService";
import type { Material, WithId } from "@/types";
import { AppError } from "@/utils/errors";

/**
 * Nuovo testo (ADR D27): chiede solo il titolo, poi `onCreated` apre l'editor visuale,
 * dove si scrive il testo e lo si associa alle tracce.
 */
export function TextCreateDialog({
  open,
  onOpenChange,
  folderId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Cartella in cui crearlo (quella aperta nella pagina Materiali). */
  folderId?: string;
  onCreated: (material: WithId<Material>) => void;
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Nuovo testo" description="Poi lo scrivi nell'editor e lo associ alle tracce.">
      <TextCreateForm folderId={folderId} onCreated={onCreated} onDone={() => onOpenChange(false)} />
    </FormDialog>
  );
}

function TextCreateForm({
  folderId,
  onCreated,
  onDone,
}: {
  folderId?: string;
  onCreated: (material: WithId<Material>) => void;
  onDone: () => void;
}) {
  const { uid } = useSession();
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = title.trim();
  const create = useStaffMutation(
    async () => {
      const material = await materialService.get(await materialService.createText(trimmed, folderId, uid));
      if (!material) throw new AppError("Testo creato, ma non è stato possibile aprirlo: lo trovi nell'elenco.");
      return material;
    },
    {
      invalidate: [["materials"]],
      onSuccess: (material) => {
        onDone();
        onCreated(material);
      },
    },
  );

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (trimmed) create.mutate(undefined);
      }}
    >
      <Field label="Titolo" required error={touched && !trimmed ? "Inserisci un titolo" : undefined}>
        {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} autoFocus />}
      </Field>
      <FormActions onCancel={onDone} submitting={create.isPending} submitLabel="Crea e scrivi" />
    </form>
  );
}
