"use client";

import { AppShell } from "@/components/layout/app-shell";
import { STUDENT_NAV } from "@/components/layout/nav-config";
import { AudioDockProvider } from "@/features/materials/audio-dock";
import { RoleGate } from "@/features/auth/role-gate";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate permission="student:area">
      <AudioDockProvider>
        <AppShell nav={STUDENT_NAV} home="/dashboard" profileHref="/profile" notificationsHref="/announcements">
          {children}
        </AppShell>
      </AudioDockProvider>
    </RoleGate>
  );
}
