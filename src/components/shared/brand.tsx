import Image from "next/image";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/utils/format";

export const BRAND = {
  school: "Musikademy",
  tagline: "Learn. Practice. Grow.",
} as const;

export function BrandLockup({ href, context, className }: { href: string; context?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex min-w-0 items-center gap-2", className)} aria-label={`${BRAND.school} – home`}>
      <Image src="/brand/mark.webp" alt="" width={44} height={32} className="h-8 w-11 shrink-0" priority />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-lg leading-none font-bold tracking-tight text-brand-ink">{BRAND.school}</span>
        <span className="truncate text-[11px] font-medium text-muted-foreground">
          {BRAND.tagline}
          {context ? ` • ${context}` : ""}
        </span>
      </span>
    </Link>
  );
}

export function UserAvatar({
  person,
  size = "md",
  className,
}: {
  person: { name?: string; surname?: string; photoURL?: string } | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const dim = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-20 text-xl" }[size];
  return (
    <Avatar className={cn(dim, className)}>
      {person?.photoURL && <AvatarImage src={person.photoURL} alt="" />}
      <AvatarFallback className="bg-violet-soft font-bold text-violet-ink">{initials(person)}</AvatarFallback>
    </Avatar>
  );
}
