"use client";

import { PageContainer, PageHeader } from "@/components/shared/page";
import { useSession } from "@/features/auth/auth-provider";
import { useWhatsAppSettings } from "@/features/whatsapp/hooks";
import {
  ProviderSettings,
  ReminderSettings,
  WhatsAppConnection,
  WhatsAppMessageLog,
  ZernioConnection,
} from "@/features/whatsapp/whatsapp-panel";
import { can } from "@/lib/auth/roles";

export default function AdminWhatsAppPage() {
  const { role } = useSession();
  const isAdmin = can(role, "settings:manage");
  const provider = useWhatsAppSettings().data?.provider;
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="WhatsApp"
        description="Comunicazioni e promemoria delle lezioni inviati su WhatsApp dal numero della scuola."
      />
      <ProviderSettings editable={isAdmin} />
      {provider === "zernio" ? (
        <ZernioConnection editable={isAdmin} />
      ) : (
        provider && <WhatsAppConnection editable={isAdmin} />
      )}
      <ReminderSettings editable={isAdmin} />
      <WhatsAppMessageLog />
    </PageContainer>
  );
}
