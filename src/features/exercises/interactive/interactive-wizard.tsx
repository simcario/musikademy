"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { cn } from "@/lib/utils";
import { assignmentService } from "@/services/assignmentService";
import { fromInputDate, fullName } from "@/utils/format";
import type { InteractiveCatalogEntry } from "./catalog";
import { settingsSteps } from "./interactive-settings";

/** Assegnazione guidata di un esercizio interattivo: un passo per ogni scelta, poi gli studenti. */
export function InteractiveWizardDialog({ entry, onClose }: { entry: InteractiveCatalogEntry | null; onClose: () => void }) {
  return (
    <FormDialog open={!!entry} onOpenChange={(o) => !o && onClose()} title={entry ? `Assegna · ${entry.title}` : "Assegna"} wide>
      {entry && <Wizard key={entry.kind} entry={entry} onClose={onClose} />}
    </FormDialog>
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
      <div className="space-y-2">
        <ol className="flex gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <li key={s.title} className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-surface-highest")} />
          ))}
        </ol>
        <p className="section-label" aria-live="polite">
          Passo {index + 1} di {steps.length} · {steps[index].title}
        </p>
      </div>

      <div className="min-h-48 space-y-3">{steps[index].content}</div>

      <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-between gap-2 border-t border-border bg-popover px-5 py-3">
        <Button type="button" variant="outline" disabled={assign.isPending} onClick={() => (index === 0 ? onClose() : setIndex(index - 1))}>
          {index === 0 ? (
            "Annulla"
          ) : (
            <>
              <ArrowLeft aria-hidden /> Indietro
            </>
          )}
        </Button>
        <Button type="submit" disabled={assign.isPending}>
          {last ? (
            <>
              {assign.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Assegna
            </>
          ) : (
            <>
              Avanti <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
