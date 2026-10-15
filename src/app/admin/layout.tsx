"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ADMIN_NAV, navFor } from "@/components/layout/nav-config";
import { useAuth } from "@/features/auth/auth-provider";
import { GlobalSearch } from "@/features/admin/global-search";
import { AudioDockProvider } from "@/features/materials/audio-dock";
import { UploadQueueProvider } from "@/features/materials/upload-queue";
import { RoleGate, SectionGate } from "@/features/auth/role-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { access } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <RoleGate permission="staff:area">
      <AudioDockProvider>
        <UploadQueueProvider>
        <AppShell nav={navFor(ADMIN_NAV, access)} home="/admin" profileHref="/admin/profile" onSearch={() => setSearchOpen(true)}>
          <SectionGate nav={ADMIN_NAV} home="/admin">
            {children}
          </SectionGate>
        </AppShell>
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        </UploadQueueProvider>
      </AudioDockProvider>
    </RoleGate>
  );
}
