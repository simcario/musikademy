"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LayoutGrid, LogOut, Search, UserRound } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLockup, UserAvatar } from "@/components/shared/brand";
import { useSession } from "@/features/auth/auth-provider";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { fullName } from "@/utils/format";
import { isActive, titleFor, type NavItem } from "./nav-config";

interface ShellProps {
  nav: NavItem[];
  home: string;
  profileHref: string;
  notificationsHref?: string;
  onSearch?: () => void;
  children: React.ReactNode;
}

/**
 * Shell responsive (DESIGN.md → Layout & Spacing):
 * - < 768px: header glass + bottom navigation (5 voci, "Altro" apre le secondarie)
 * - ≥ 768px: sidebar persistente + area contenuti
 */
export function AppShell({ nav, home, profileHref, notificationsHref, onSearch, children }: ShellProps) {
  const pathname = usePathname();
  const context = titleFor(pathname, nav);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[256px_1fr]">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>
      <Sidebar nav={nav} home={home} pathname={pathname} />
      <div className="flex min-w-0 flex-col">
        <TopBar
          home={home}
          context={context}
          profileHref={profileHref}
          notificationsHref={notificationsHref}
          onSearch={onSearch}
        />
        <main id="main" className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-10">
          {children}
        </main>
      </div>
      <BottomNav nav={nav} pathname={pathname} />
    </div>
  );
}

function Sidebar({ nav, home, pathname }: { nav: NavItem[]; home: string; pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-card px-4 py-5 md:flex">
      <BrandLockup href={home} className="px-2" />
      <nav aria-label="Navigazione principale" className="flex flex-col gap-1">
        {nav.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-indigo-soft text-brand-ink" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar({
  home,
  context,
  profileHref,
  notificationsHref,
  onSearch,
}: {
  home: string;
  context?: string;
  profileHref: string;
  notificationsHref?: string;
  onSearch?: () => void;
}) {
  const { profile, role, signOut } = useSession();
  const router = useRouter();
  return (
    <header className="glass pt-safe sticky top-0 z-40 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex h-16 items-center justify-between gap-2 px-4 md:px-8">
        <BrandLockup href={home} context={context} className="md:hidden" />
        <p className="hidden text-sm font-medium text-muted-foreground md:block">{context}</p>
        <div className="flex shrink-0 items-center gap-1">
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              aria-label="Cerca"
              className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-high hover:text-brand-ink md:w-64 md:justify-start md:gap-2 md:rounded-lg md:border md:border-border md:bg-card md:px-3"
            >
              <Search className="size-5 md:size-4" aria-hidden />
              <span className="hidden text-sm md:inline">Cerca studenti, lezioni…</span>
              <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[10px] md:inline">Ctrl K</kbd>
            </button>
          )}
          {notificationsHref && (
            <Link
              href={notificationsHref}
              aria-label="Comunicazioni"
              className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-high hover:text-brand-ink"
            >
              <Bell className="size-6" aria-hidden />
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Menu profilo"
              className="flex size-11 items-center justify-center rounded-full hover:opacity-90"
            >
              <UserAvatar person={profile} className="ring-2 ring-indigo-soft" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <span className="block truncate font-semibold text-foreground">{fullName(profile)}</span>
                  <span className="block text-xs font-normal">{role ? ROLE_LABEL[role] : ""}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(profileHref)} className="min-h-10">
                <UserRound aria-hidden /> Profilo
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="min-h-10"
                onClick={async () => {
                  await signOut();
                  router.replace("/login");
                }}
              >
                <LogOut aria-hidden /> Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = nav.filter((i) => i.primary);
  const secondary = nav.filter((i) => !i.primary);
  const secondaryActive = secondary.some((i) => isActive(pathname, i));

  const itemClass = (active: boolean) =>
    cn(
      "flex min-h-11 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] leading-tight font-semibold transition-colors",
      active ? "text-brand-ink" : "text-muted-foreground hover:text-brand-ink",
    );

  return (
    <>
      <nav
        aria-label="Navigazione principale"
        className="glass pb-safe fixed inset-x-0 bottom-0 z-40 shadow-dock md:hidden"
      >
        <div className="flex h-16 items-center justify-around px-1">
          {primary.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                <item.icon className="size-6" aria-hidden />
                {item.short ?? item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className={itemClass(secondaryActive)} aria-haspopup="dialog">
            <LayoutGrid className="size-6" aria-hidden />
            Altro
          </button>
        </div>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-safe rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Altre sezioni</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-6">
            {secondary.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-semibold",
                    active ? "border-primary bg-indigo-soft text-brand-ink" : "border-border bg-card text-foreground",
                  )}
                >
                  <item.icon className="size-6 text-brand-ink" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
