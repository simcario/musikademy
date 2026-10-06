import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  CreditCard,
  Headphones,
  LayoutGrid,
  Library,
  Megaphone,
  Settings,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Voce presente nella bottom navigation mobile. */
  primary?: boolean;
  /** Etichetta corta per la bottom nav. */
  short?: string;
  exact?: boolean;
}

export const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, primary: true, exact: true },
  { href: "/lessons", label: "Le mie lezioni", short: "Lezioni", icon: CalendarDays, primary: true },
  { href: "/exercises", label: "Esercizi", icon: CircleCheckBig, primary: true },
  { href: "/materials", label: "Materiali", icon: Library, primary: true },
  { href: "/listening", label: "Ascolti", icon: Headphones },
  { href: "/tools", label: "Strumenti", icon: Wrench },
  { href: "/attendance", label: "Presenze", icon: ClipboardCheck },
  { href: "/payments", label: "Pagamenti", icon: CreditCard },
  { href: "/announcements", label: "Comunicazioni", icon: Megaphone },
  { href: "/profile", label: "Profilo", icon: UserRound },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid, primary: true, exact: true },
  { href: "/admin/students", label: "Studenti", icon: Users, primary: true },
  { href: "/admin/lessons", label: "Lezioni", icon: CalendarDays, primary: true },
  { href: "/admin/materials", label: "Materiali", icon: Library, primary: true },
  { href: "/admin/exercises", label: "Esercizi", icon: BookOpen },
  { href: "/admin/tools", label: "Strumenti", icon: Wrench },
  { href: "/admin/announcements", label: "Comunicazioni", icon: Megaphone },
  { href: "/admin/payments", label: "Pagamenti", icon: CreditCard },
  { href: "/admin/settings", label: "Impostazioni", icon: Settings },
];

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function titleFor(pathname: string, nav: NavItem[]) {
  const match = [...nav].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(pathname, i));
  return match?.short ?? match?.label;
}
