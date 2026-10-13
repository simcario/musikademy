"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PanelKind = "course" | "user" | "group";

/** Corso fittizio che raccoglie gruppi e studenti non collegati a un corso. */
export const NO_COURSE = "none";

/**
 * Pannello laterale della sezione Organizzazione. Lo stato sta nell'URL (`?p=`): una pila di livelli
 * `tipo:id[:scheda]` separati da virgola (es. `course:abc:students,user:xyz`), così i livelli annidati
 * si aprono nello stesso pannello e il tasto indietro del browser funziona.
 */
export function usePanel() {
  const router = useRouter();
  const search = useSearchParams();
  const stack = (search.get("p") ?? "").split(",").filter(Boolean);

  const href = (next: string[]) => {
    const q = new URLSearchParams();
    const tab = search.get("tab");
    if (tab) q.set("tab", tab);
    if (next.length) q.set("p", next.join(","));
    const s = q.toString();
    return s ? `/admin/organization?${s}` : "/admin/organization";
  };
  const show = (next: string[]) => router.push(href(next), { scroll: false });

  return {
    stack,
    /** La riga dell'elenco da cui è partito il pannello aperto. */
    selected: (kind: PanelKind, id: string) => stack[0]?.split(":").slice(0, 2).join(":") === `${kind}:${id}`,
    /** Apre un pannello da un elenco della pagina (primo livello). */
    show: (kind: PanelKind, id: string) => show([`${kind}:${id}`]),
    /** Apre un livello annidato sopra quello corrente. */
    open: (kind: PanelKind, id: string) => show([...stack, `${kind}:${id}`]),
    back: () => show(stack.slice(0, -1)),
    close: () => show([]),
    /** Cambia scheda del livello corrente senza aggiungere una voce alla cronologia. */
    setTab: (tab: string) => {
      const [kind, id] = (stack.at(-1) ?? "").split(":");
      router.replace(href([...stack.slice(0, -1), `${kind}:${id}:${tab}`]), { scroll: false });
    },
  };
}

/** Intestazione di un livello: "indietro" se ce n'è uno sotto, X per chiudere il pannello. */
export function PanelHeader({
  title,
  description,
  badges,
  actions,
}: {
  title: string;
  description?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const panel = usePanel();
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border px-3 py-2">
      {panel.stack.length > 1 && (
        <Button variant="ghost" size="icon" onClick={panel.back} aria-label="Indietro">
          <ArrowLeft aria-hidden />
        </Button>
      )}
      <div className="min-w-0 flex-1 px-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          {badges}
        </div>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
      <Button variant="ghost" size="icon" onClick={panel.close} aria-label="Chiudi">
        <X aria-hidden />
      </Button>
    </header>
  );
}

/** Stile degli elenchi a tabella della sezione: la riga aperta nel pannello resta evidenziata. */
export const TABLE_HEAD = "border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground";
export const rowClass = (selected: boolean) =>
  cn("cursor-pointer transition-colors", selected ? "bg-indigo-soft/60" : "hover:bg-muted/50");

export function PanelBody({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>;
}
