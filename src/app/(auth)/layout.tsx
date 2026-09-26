import Image from "next/image";
import { BRAND } from "@/components/shared/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-violet-soft blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-indigo-soft blur-3xl" />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/brand/logo-full.webp" alt={BRAND.school} width={240} height={150} priority className="h-auto w-44" />
          <span className="rounded-full bg-violet-soft px-2.5 py-1 text-xs font-semibold text-violet-ink">
            {BRAND.product} · {BRAND.tagline}
          </span>
        </div>
        <div className="card-surface p-6 shadow-card-hover">{children}</div>
      </div>
    </main>
  );
}
