"use client";

import { Suspense, use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Link diretto a uno studente (ricerca, vecchi indirizzi): apre il pannello nella sezione Organizzazione. */
export default function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  return (
    <Suspense>
      <OpenUserPanel studentId={studentId} />
    </Suspense>
  );
}

function OpenUserPanel({ studentId }: { studentId: string }) {
  const router = useRouter();
  const tab = useSearchParams().get("tab");
  useEffect(() => {
    const entry = ["user", studentId, ...(tab ? [tab] : [])].join(":");
    router.replace(`/admin/organization?tab=users&p=${encodeURIComponent(entry)}`);
  }, [router, studentId, tab]);
  return null;
}
