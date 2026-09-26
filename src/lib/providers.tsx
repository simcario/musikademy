"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/features/auth/auth-provider";
import { ServiceWorkerRegistrar } from "@/lib/pwa";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => {
              const code = (error as { code?: string })?.code;
              return code !== "permission-denied" && count < 2;
            },
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster />
      <ServiceWorkerRegistrar />
    </QueryClientProvider>
  );
}
