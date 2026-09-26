import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="section-label text-brand-ink">{eyebrow}</p>}
        <h1 className="text-[28px] leading-9 font-bold tracking-tight md:text-[32px] md:leading-10">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeader({
  title,
  count,
  href,
  linkLabel = "Vedi tutti",
  icon,
}: {
  title: string;
  count?: number;
  href?: string;
  linkLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg leading-[26px] font-semibold">{title}</h2>
        {!!count && (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {count}
          </span>
        )}
      </div>
      {href ? (
        <Link
          href={href}
          className="flex min-h-11 items-center gap-0.5 text-[13px] font-semibold text-brand-ink hover:underline"
        >
          {linkLabel} <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        icon
      )}
    </div>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-5xl space-y-6 px-4 py-5 md:px-8 md:py-8", className)}>{children}</div>;
}
