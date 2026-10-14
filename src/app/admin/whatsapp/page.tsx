import { redirect } from "next/navigation";

/** WhatsApp ora è una scheda di Impostazioni: il vecchio indirizzo resta valido per link e segnalibri. */
export default function AdminWhatsAppPage() {
  redirect("/admin/settings");
}
