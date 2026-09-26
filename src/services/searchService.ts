import { limit, where } from "firebase/firestore";
import type { Announcement, Assignment, Lesson, Material, Student } from "@/types";
import { fullName } from "@/utils/format";
import { searchToken } from "@/utils/keywords";
import { COLLECTIONS, list } from "./base";

export interface SearchHit {
  id: string;
  kind: "student" | "lesson" | "material" | "assignment" | "announcement";
  title: string;
  subtitle?: string;
  href: string;
}

/**
 * Ricerca globale docente (ADR D7): `array-contains` sulle keyword di ogni collezione.
 * Un motore esterno (Algolia/Typesense) può sostituire questa funzione mantenendo la firma.
 */
export async function globalSearch(q: string, perKind = 5): Promise<SearchHit[]> {
  const token = searchToken(q);
  if (!token) return [];
  const by = where("keywords", "array-contains", token);
  const settle = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);

  const [students, lessons, materials, assignments, announcements] = await Promise.all([
    settle(list<Student>(COLLECTIONS.students, by, limit(perKind))),
    settle(list<Lesson>(COLLECTIONS.lessons, by, limit(perKind))),
    settle(list<Material>(COLLECTIONS.materials, by, limit(perKind))),
    settle(list<Assignment>(COLLECTIONS.assignments, by, limit(perKind))),
    settle(list<Announcement>(COLLECTIONS.announcements, by, limit(perKind))),
  ]);

  return [
    ...students.map<SearchHit>((s) => ({
      id: s.id,
      kind: "student",
      title: fullName(s),
      subtitle: s.email,
      href: `/admin/students/${s.id}`,
    })),
    ...lessons.map<SearchHit>((l) => ({
      id: l.id,
      kind: "lesson",
      title: l.title,
      subtitle: l.studentName,
      href: `/admin/lessons?edit=${l.id}`,
    })),
    ...materials.map<SearchHit>((m) => ({
      id: m.id,
      kind: "material",
      title: m.title,
      subtitle: m.fileName,
      href: `/admin/materials?q=${encodeURIComponent(m.title)}`,
    })),
    ...assignments.map<SearchHit>((a) => ({
      id: a.id,
      kind: "assignment",
      title: a.title,
      subtitle: a.studentName,
      href: `/admin/students/${a.studentId}?tab=exercises`,
    })),
    ...announcements.map<SearchHit>((a) => ({
      id: a.id,
      kind: "announcement",
      title: a.title,
      subtitle: a.authorName,
      href: `/admin/announcements`,
    })),
  ];
}
