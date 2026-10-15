"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDockVisible } from "@/features/materials/audio-dock";
import { cn } from "@/lib/utils";

/**
 * Pannello laterale per creare e modificare (tutti i form dell'app): entra da destra a tutta altezza,
 * con intestazione fissa e contenuto scorrevole; su mobile occupa lo schermo intero.
 * Se il contenuto è un `<form>` che termina con `FormActions`, i pulsanti restano in fondo al pannello.
 * Stessa larghezza del pannello di dettaglio di Organizzazione, così aperto da lì lo copre esattamente.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Form con molti campi affiancati (es. caricamento materiale). */
  wide?: boolean;
}) {
  const dockVisible = useDockVisible();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "pt-safe w-full! max-w-none! gap-0 shadow-dialog",
          wide ? "sm:w-[clamp(560px,50vw,800px)]!" : "sm:w-[clamp(480px,40vw,640px)]!",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border py-4 pr-14 pl-5">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          {description && <SheetDescription className="truncate">{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [&>form]:flex [&>form]:min-h-full [&>form]:flex-col">
          {children}
        </div>
        {/* Il player audio resta sopra il pannello: lascia spazio così non copre i pulsanti in fondo. */}
        {dockVisible && (
          <div className="h-[calc(140px+env(safe-area-inset-bottom))] shrink-0 border-t border-border md:h-24" aria-hidden />
        )}
      </SheetContent>
    </Sheet>
  );
}
