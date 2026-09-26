"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FullPageLoader } from "@/components/shared/states";
import { useAuth } from "@/features/auth/auth-provider";
import { homeFor } from "@/lib/auth/roles";

/** Punto d'ingresso: instrada verso l'area corretta in base al ruolo. */
export default function Home() {
  const { status, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out" || status === "no-role") router.replace("/login");
    else if (status === "signed-in" && role) router.replace(homeFor(role));
  }, [status, role, router]);

  return <FullPageLoader />;
}
