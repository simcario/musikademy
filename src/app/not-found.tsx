import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="section-label text-brand-ink">Errore 404</p>
      <h1 className="text-2xl font-bold">Pagina non trovata</h1>
      <p className="max-w-sm text-sm text-muted-foreground">La pagina che cerchi non esiste o è stata spostata.</p>
      <Link href="/" className={buttonVariants()}>
        Torna alla home
      </Link>
    </main>
  );
}
