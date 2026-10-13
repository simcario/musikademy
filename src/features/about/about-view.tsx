"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheckBig, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { APP_VERSION, BUILD_ID, BUILD_TIME, type BuildInfo } from "@/lib/build-info";
import { formatDate } from "@/utils/format";

interface DeviceState {
  /** Build del service worker attivo (null = nessun service worker). */
  workerBuild: string | null;
  caches: string[];
  standalone: boolean;
}

async function readDeviceState(): Promise<DeviceState> {
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  const scriptUrl = registration?.active?.scriptURL;
  return {
    workerBuild: scriptUrl ? (new URL(scriptUrl).searchParams.get("v") ?? "precedente") : null,
    caches: "caches" in window ? await caches.keys() : [],
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

async function fetchServerBuild(): Promise<BuildInfo> {
  const res = await fetch("/api/build", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Info app: build in esecuzione, confronto con quella pubblicata e stato della cache del dispositivo. */
export function AboutView() {
  const server = useQuery({ queryKey: ["build-info"], queryFn: fetchServerBuild, staleTime: 0, gcTime: 0 });
  const device = useQuery({ queryKey: ["device-state"], queryFn: readDeviceState, staleTime: 0, gcTime: 0 });
  const [clearing, setClearing] = useState(false);

  const outdated = !!server.data && server.data.buildId !== BUILD_ID;
  const checking = server.isFetching || device.isFetching;

  async function clearAndReload() {
    setClearing(true);
    try {
      if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
    } finally {
      // Al ricaricamento la pagina arriva dalla rete e registra il service worker della build corrente.
      window.location.reload();
    }
  }

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="Info app" description="Versione installata su questo dispositivo e stato della cache." />

      <section className="card-surface space-y-3 p-4">
        <h2 className="font-semibold">Versione</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Versione" value={APP_VERSION} />
          <Row label="Build" value={BUILD_ID} mono />
          <Row label="Compilata il" value={BUILD_TIME ? formatDate(new Date(BUILD_TIME), "d MMMM yyyy, HH:mm") : "—"} />
          <Row
            label="Build pubblicata"
            value={server.isError ? "Non verificabile (offline?)" : (server.data?.buildId ?? "…")}
            mono={!!server.data}
          />
        </dl>
        {server.data && (
          <p
            role="status"
            className={`flex items-center gap-2 text-sm font-medium ${outdated ? "text-destructive" : "text-brand-ink"}`}
          >
            {outdated ? (
              <>
                <TriangleAlert className="size-4 shrink-0" aria-hidden /> È disponibile una versione più recente:
                aggiorna l&apos;app.
              </>
            ) : (
              <>
                <CircleCheckBig className="size-4 shrink-0" aria-hidden /> L&apos;app è aggiornata.
              </>
            )}
          </p>
        )}
      </section>

      <section className="card-surface space-y-3 p-4">
        <h2 className="font-semibold">Dispositivo</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Modalità" value={device.data ? (device.data.standalone ? "App installata" : "Browser") : "…"} />
          <Row
            label="Service worker"
            value={device.data ? (device.data.workerBuild ? `Attivo · build ${device.data.workerBuild}` : "Non attivo") : "…"}
          />
          <Row label="Cache" value={device.data ? device.data.caches.join(", ") || "Vuota" : "…"} mono={!!device.data?.caches.length} />
        </dl>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1"
          disabled={checking || clearing}
          onClick={() => {
            void server.refetch();
            void device.refetch();
          }}
        >
          {checking ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Verifica aggiornamenti
        </Button>
        <Button variant={outdated ? "default" : "outline"} className="flex-1" disabled={clearing} onClick={clearAndReload}>
          {clearing ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          {outdated ? "Aggiorna l'app" : "Svuota cache e ricarica"}
        </Button>
      </div>
    </PageContainer>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 text-right break-words ${mono ? "font-mono text-[13px]" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
