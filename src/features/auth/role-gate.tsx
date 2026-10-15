"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/shared/states";
import { blockedSection, type NavItem } from "@/components/layout/nav-config";
import { can, homeFor, type Permission } from "@/lib/auth/roles";
import { useAuth } from "./auth-provider";

/**
 * Guard frontend per ruolo (ADR D10). È solo UX: la protezione effettiva dei dati
 * è nelle Security Rules, che negano comunque le letture non autorizzate.
 */
export function RoleGate({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { status, role, access, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = status === "signed-in" && can(access, permission);

  useEffect(() => {
    if (status === "signed-out") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (status === "signed-in" && role && !can(access, permission)) {
      router.replace(homeFor(role));
    }
  }, [status, role, access, permission, router, pathname]);

  if (status === "no-role") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldAlert className="size-10 text-warning" aria-hidden />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Account non ancora abilitato</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Il tuo account non ha un ruolo assegnato. Contatta la segreteria o il tuo docente.
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          Esci
        </Button>
      </main>
    );
  }
  if (!allowed) return <FullPageLoader />;
  return <>{children}</>;
}

/**
 * Sezioni consentite dal ruolo (ADR D31): chi apre l'indirizzo di una sezione non concessa torna alla home.
 * Anche qui è solo UX: le Security Rules negano comunque i dati.
 */
export function SectionGate({ nav, home, children }: { nav: NavItem[]; home: string; children: React.ReactNode }) {
  const { access } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const blocked = blockedSection(pathname, nav, access);
  useEffect(() => {
    if (blocked) router.replace(home);
  }, [blocked, home, router]);
  return blocked ? <FullPageLoader /> : <>{children}</>;
}
