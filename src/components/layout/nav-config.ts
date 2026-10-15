import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  CreditCard,
  Headphones,
  Info,
  LayoutGrid,
  Library,
  ListMusic,
  Music,
  Megaphone,
  Settings,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { can, type Access, type Permission } from "@/lib/auth/roles";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Voce presente nella bottom navigation mobile. */
  primary?: boolean;
  /** Etichetta corta per la bottom nav. */
  short?: string;
  exact?: boolean;
  /** Permesso richiesto (ADR D31): senza, la voce non compare e la pagina non è raggiungibile. */
  permission?: Permission;
}

export const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, primary: true, exact: true },
  { href: "/lessons", label: "Le mie lezioni", short: "Lezioni", icon: CalendarDays, primary: true, permission: "area:lessons" },
  { href: "/exercises", label: "Esercizi", icon: CircleCheckBig, primary: true, permission: "area:exercises" },
  { href: "/materials", label: "Materiali", icon: Library, primary: true, permission: "area:materials" },
  { href: "/listening", label: "Ascolti", icon: Headphones, permission: "area:materials" },
  { href: "/playlists", label: "Playlist", icon: ListMusic, permission: "area:playlists" },
  { href: "/tools", label: "Strumenti", icon: Wrench, permission: "area:tools" },
  { href: "/attendance", label: "Presenze", icon: ClipboardCheck, permission: "area:attendance" },
  { href: "/payments", label: "Pagamenti", icon: CreditCard, permission: "area:payments" },
  { href: "/announcements", label: "Comunicazioni", icon: Megaphone, permission: "area:announcements" },
  { href: "/profile", label: "Profilo", icon: UserRound },
  { href: "/about", label: "Info app", icon: Info },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid, primary: true, exact: true },
  { href: "/admin/organization", label: "Organizzazione", short: "Scuola", icon: Users, primary: true, permission: "students:manage" },
  { href: "/admin/lessons", label: "Lezioni", icon: CalendarDays, primary: true, permission: "lessons:manage" },
  { href: "/admin/materials", label: "Materiali", icon: Library, primary: true, permission: "materials:manage" },
  { href: "/admin/songs", label: "Brani", icon: Music, permission: "materials:manage" },
  { href: "/admin/playlists", label: "Playlist", icon: ListMusic, permission: "materials:manage" },
  { href: "/admin/exercises", label: "Esercizi", icon: BookOpen, permission: "assignments:manage" },
  { href: "/admin/tools", label: "Strumenti", icon: Wrench },
  { href: "/admin/announcements", label: "Comunicazioni", icon: Megaphone, permission: "announcements:manage" },
  { href: "/admin/payments", label: "Pagamenti", icon: CreditCard, permission: "payments:manage" },
  { href: "/admin/settings", label: "Impostazioni", icon: Settings },
  { href: "/admin/about", label: "Info app", icon: Info },
];

/** Voci consentite all'accesso corrente. */
export function navFor(nav: NavItem[], access: Access | null): NavItem[] {
  return nav.filter((i) => !i.permission || can(access, i.permission));
}

/** La pagina appartiene a una sezione non consentita? */
export function blockedSection(pathname: string, nav: NavItem[], access: Access | null): boolean {
  const match = [...nav].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(pathname, i));
  return !!match?.permission && !can(access, match.permission);
}

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function titleFor(pathname: string, nav: NavItem[]) {
  const match = [...nav].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(pathname, i));
  return match?.short ?? match?.label;
}
