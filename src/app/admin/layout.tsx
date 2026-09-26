"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ADMIN_NAV } from "@/components/layout/nav-config";
import { GlobalSearch } from "@/features/admin/global-search";
import { AudioDockProvider } from "@/features/materials/audio-dock";
import { UploadQueueProvider } from "@/features/materials/upload-queue";
import { RoleGate } from "@/features/auth/role-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

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
        <AppShell nav={ADMIN_NAV} home="/admin" profileHref="/admin/profile" onSearch={() => setSearchOpen(true)}>
          {children}
        </AppShell>
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        </UploadQueueProvider>
      </AudioDockProvider>
    </RoleGate>
  );
}
