"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { TabBar } from "@/components/shared/segmented";
import { useSession } from "@/features/auth/auth-provider";
import { useWhatsAppSettings } from "@/features/whatsapp/hooks";
import { MessageTemplates } from "@/features/whatsapp/message-templates";
import {
  ProviderSettings,
  ReminderSettings,
  WhatsAppConnection,
  WhatsAppMessageLog,
  ZernioConnection,
} from "@/features/whatsapp/whatsapp-panel";
import { can } from "@/lib/auth/roles";
import { enablePush, pushConfigured } from "@/lib/firebase/messaging";
import { errorMessage } from "@/utils/errors";

type Tab = "whatsapp" | "notifications";

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const router = useRouter();
  const tab: Tab = useSearchParams().get("tab") === "notifications" ? "notifications" : "whatsapp";
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Impostazioni" />
      <TabBar<Tab>
        label="Sezione"
        value={tab}
        onChange={(t) => router.replace(t === "whatsapp" ? "/admin/settings" : `/admin/settings?tab=${t}`, { scroll: false })}
        options={[
          { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
          { value: "notifications", label: "Notifiche", icon: BellRing },
        ]}
      />
      {tab === "whatsapp" ? <WhatsAppSection /> : <NotificationsSection />}
    </PageContainer>
  );
}

// ─────────────── WhatsApp ───────────────
function WhatsAppSection() {
  const { role } = useSession();
  const isAdmin = can(role, "settings:manage");
  const provider = useWhatsAppSettings().data?.provider;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Comunicazioni e promemoria delle lezioni inviati su WhatsApp dal numero della scuola.
      </p>
      <ProviderSettings editable={isAdmin} />
      {provider === "zernio" ? (
        <ZernioConnection editable={isAdmin} />
      ) : (
        provider && <WhatsAppConnection editable={isAdmin} />
      )}
      <ReminderSettings editable={isAdmin} />
      <MessageTemplates editable={isAdmin} />
      <WhatsAppMessageLog />
    </>
  );
}

// ─────────────── Notifiche ───────────────
function NotificationsSection() {
  const { uid } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card-surface space-y-2 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <BellRing className="size-5 text-brand-ink" aria-hidden /> Notifiche push
      </h2>
      {pushConfigured() ? (
        <>
          <p className="text-sm text-muted-foreground">Abilita le notifiche su questo dispositivo.</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (await enablePush(uid)) toast.success("Notifiche abilitate su questo dispositivo");
                else toast.info("Notifiche non abilitate: permesso negato o browser non supportato.");
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Abilita notifiche
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Infrastruttura predisposta. Per attivarla configura la chiave VAPID (NEXT_PUBLIC_FIREBASE_VAPID_KEY) — vedi README.
        </p>
      )}
    </section>
  );
}
