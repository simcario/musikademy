"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/utils/errors";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-indigo-soft text-brand-ink">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-danger/20 bg-danger-soft/50 px-6 py-8 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-sm font-medium text-danger">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden /> Riprova
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Caricamento in corso">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card-surface space-y-3 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function FullPageLoader({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Gestisce in modo uniforme i quattro stati (§45): loading, error, empty, success.
 */
export function QueryState<T>({
  query,
  isEmpty,
  empty,
  loading,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  loading?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <ListSkeleton />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
  label = "Carica altri",
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  label?: string;
}) {
  if (!hasMore) return null;
  return (
    <Button variant="secondary" className="w-full" onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCw aria-hidden />}
      {loading ? "Caricamento…" : label}
    </Button>
  );
}
