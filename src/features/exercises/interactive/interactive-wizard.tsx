"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { WizardActions, WizardProgress } from "@/components/shared/wizard";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { assignmentService } from "@/services/assignmentService";
import { fromInputDate, fullName } from "@/utils/format";
import type { InteractiveCatalogEntry } from "./catalog";
import { settingsSteps } from "./interactive-settings";

/** Assegnazione guidata di un esercizio interattivo: un passo per ogni scelta, poi gli studenti. */
export function InteractiveWizardDialog({ entry, onClose }: { entry: InteractiveCatalogEntry | null; onClose: () => void }) {
  return (
    <SidePanel open={!!entry} onOpenChange={(o) => !o && onClose()} title={entry ? `Assegna · ${entry.title}` : "Assegna"} wide>
      {entry && <Wizard key={entry.kind} entry={entry} onClose={onClose} />}
    </SidePanel>
  );
}

function Wizard({ entry, onClose }: { entry: InteractiveCatalogEntry; onClose: () => void }) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const [exercise, setExercise] = useState(entry.defaults);
  const [title, setTitle] = useState(entry.title);
  const [dueDate, setDueDate] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);

  const titleError = title.trim() ? undefined : "Inserisci un titolo";
  const studentsError = studentIds.length ? undefined : "Seleziona almeno uno studente";

  const assign = useStaffMutation(
    () =>
      assignmentService.assign(
        {
          title: title.trim(),
          description: entry.instructions,
          interactive: exercise,
          materialIds: [],
          dueDate: dueDate ? fromInputDate(dueDate, "23:59") : undefined,
        },
        (students.data ?? []).filter((s) => studentIds.includes(s.id)).map((s) => ({ id: s.id, name: fullName(s) })),
        uid,
      ),
    {
      success: `Esercizio assegnato a ${studentIds.length} student${studentIds.length === 1 ? "e" : "i"}`,
      invalidate: [["assignments"]],
      onSuccess: onClose,
    },
  );

  const steps = [
    ...settingsSteps(exercise, setExercise),
    {
      title: "Studenti",
      content: (
        <>
          <Field label="Titolo" error={touched ? titleError : undefined} required>
            {(p) => <Input {...p} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label="Scadenza">{(p) => <Input {...p} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
          <div className="space-y-1">
            <CheckList
              label="Studenti"
              items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
              selected={studentIds}
              onChange={setStudentIds}
            />
            {touched && studentsError && (
              <p role="alert" className="text-xs font-medium text-danger">
                {studentsError}
              </p>
            )}
          </div>
        </>
      ),
    },
  ];
  const last = index === steps.length - 1;

  function submit() {
    setTouched(true);
    if (!titleError && !studentsError) assign.mutate(undefined);
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (last) submit();
        else setIndex(index + 1);
      }}
    >
      <WizardProgress steps={steps.map((s) => s.title)} index={index} />

      <div className="min-h-48 space-y-3">{steps[index].content}</div>

      <WizardActions
        index={index}
        last={last}
        submitting={assign.isPending}
        submitLabel="Assegna"
        onBack={() => setIndex(index - 1)}
        onCancel={onClose}
      />
    </form>
  );
}
