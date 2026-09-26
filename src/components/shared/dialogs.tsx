"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Dialog per i form: su mobile occupa quasi tutta l'altezza con scroll interno,
 * su desktop è una modale centrata.
 */
export function FormDialog({
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
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[92dvh] gap-0 overflow-y-auto p-0 shadow-dialog",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-popover px-5 pt-5 pb-4">
          <DialogTitle className="pr-8 text-lg font-semibold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="px-5 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function FormActions({
  onCancel,
  submitting,
  submitLabel = "Salva",
}: {
  onCancel: () => void;
  submitting: boolean;
  submitLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end gap-2 border-t border-border bg-popover px-5 py-3">
      <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
        Annulla
      </Button>
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Conferma",
  destructive,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Annulla</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
