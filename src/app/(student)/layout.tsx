"use client";

import { AppShell } from "@/components/layout/app-shell";
import { STUDENT_NAV } from "@/components/layout/nav-config";
import { AudioDockProvider } from "@/features/materials/audio-dock";
import { RoleGate } from "@/features/auth/role-gate";
import { StudentContextProvider, useStudentContext } from "@/features/student-area/context";
import { ContextSwitcher } from "@/features/student-area/context-switcher";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate permission="student:area">
      <StudentContextProvider>
        <AudioDockProvider>
          <Shell>{children}</Shell>
        </AudioDockProvider>
      </StudentContextProvider>
    </RoleGate>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Il selettore prende il posto di nome e slogan solo per chi fa parte di più gruppi o corsi.
  const { current } = useStudentContext();
  return (
    <AppShell
      nav={STUDENT_NAV}
      home="/dashboard"
      profileHref="/profile"
      notificationsHref="/announcements"
      brandSlot={current ? <ContextSwitcher /> : undefined}
    >
      {children}
    </AppShell>
  );
}
