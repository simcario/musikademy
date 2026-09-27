"use client";

import { useState } from "react";
import { Check, Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { inviteMessage, inviteUrl, whatsappLink, type InviteInfo } from "@/lib/auth/invite-token";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/format";

/**
 * Condivisione del link d'invito. Firebase non invia email personalizzate senza un servizio
 * esterno: il docente lo manda da WhatsApp, dalla propria email o lo copia.
 */
export function InviteShare({
  invite,
  student,
}: {
  invite: InviteInfo;
  student: { name: string; email: string; phone?: string };
}) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(window.location.origin, invite.token);
  const expires = new Date(invite.expiresAt);
  const text = inviteMessage(student.name, url, expires);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const mailto = `mailto:${encodeURIComponent(student.email)}?subject=${encodeURIComponent(
    "Il tuo invito a Musikademy",
  )}&body=${encodeURIComponent(text)}`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Invia questo link a {student.name}: lo aprirà e collegherà il proprio account Google. Vale una sola volta,
        fino al {formatDate(expires)}.
      </p>
      <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all select-all">{url}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {student.phone && (
          <a
            href={whatsappLink(student.phone, text)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            <MessageCircle aria-hidden /> WhatsApp
          </a>
        )}
        <a href={mailto} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          <Mail aria-hidden /> Email
        </a>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              toast.success("Link copiato");
            } catch {
              toast.error("Copia non riuscita: seleziona il link e copialo a mano.");
            }
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} Copia link
        </Button>
        {canShare && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigator.share({ title: "Invito Musikademy", text }).catch(() => undefined)}
          >
            <Share2 aria-hidden /> Condividi…
          </Button>
        )}
      </div>
    </div>
  );
}
