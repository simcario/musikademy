"use client";

import { CoursePanel } from "./course-panel";
import { GroupPanel } from "./group-panel";
import { usePanel } from "./panel";
import { UserPanel } from "./user-panel";

/**
 * Pannello a comparsa da destra: mostra l'ultimo livello aperto (corso, gruppo o utente).
 * Non è modale: l'elenco resta visibile e cliccabile accanto, si chiude con la X.
 */
export function DetailPanel() {
  const panel = usePanel();
  const [kind, id, tab] = (panel.stack.at(-1) ?? "").split(":");
  if (!kind || !id) return null;
  return (
    <aside
      aria-label="Dettaglio"
      className="pt-safe fixed inset-y-0 right-0 z-50 flex w-full animate-in flex-col border-l border-border bg-popover text-sm text-popover-foreground shadow-dialog duration-200 slide-in-from-right-10 fade-in xl:w-[clamp(480px,40vw,640px)]"
    >
      {kind === "course" && <CoursePanel key={id} courseId={id} tab={tab} />}
      {kind === "group" && <GroupPanel key={id} groupId={id} />}
      {kind === "user" && <UserPanel key={id} studentId={id} tab={tab} />}
    </aside>
  );
}
