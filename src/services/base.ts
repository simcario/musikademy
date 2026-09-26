import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  query,
  serverTimestamp,
  startAfter,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Page, WithId } from "@/types";

export const COLLECTIONS = {
  users: "users",
  students: "students",
  teachers: "teachers",
  courses: "courses",
  lessons: "lessons",
  materials: "materials",
  assignments: "assignments",
  attendance: "attendance",
  payments: "payments",
  announcements: "announcements",
  notifications: "notifications",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const col = (name: CollectionName) => collection(firestore(), name);
export const ref = (name: CollectionName, id: string) => doc(firestore(), name, id);

export function withId<T>(snap: QueryDocumentSnapshot<DocumentData>): WithId<T> {
  return { id: snap.id, ...(snap.data() as T) };
}

export async function getById<T>(name: CollectionName, id: string): Promise<WithId<T> | null> {
  const snap = await getDoc(ref(name, id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as T) } as WithId<T>) : null;
}

export async function list<T>(name: CollectionName, ...constraints: QueryConstraint[]): Promise<WithId<T>[]> {
  const snap = await getDocs(query(col(name), ...constraints));
  return snap.docs.map((d) => withId<T>(d));
}

export const DEFAULT_PAGE_SIZE = 20;

/** Paginazione a cursore (ADR D9). */
export async function paginate<T>(
  name: CollectionName,
  constraints: QueryConstraint[],
  cursor: unknown | null = null,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Page<T>> {
  const parts = [...constraints];
  if (cursor) parts.push(startAfter(cursor as QueryDocumentSnapshot));
  parts.push(fbLimit(pageSize + 1));
  const snap = await getDocs(query(col(name), ...parts));
  const docs = snap.docs.slice(0, pageSize);
  return {
    items: docs.map((d) => withId<T>(d)),
    cursor: snap.docs.length > pageSize ? docs[docs.length - 1] : null,
  };
}

export const timestamps = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
export const touched = () => ({ updatedAt: serverTimestamp() });

/** Rimuove le chiavi `undefined` (Firestore le rifiuta). */
export function clean<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;
}

/** Suddivide un array in blocchi (limite di 30 valori per `in` / `array-contains-any`). */
export function chunk<T>(items: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
