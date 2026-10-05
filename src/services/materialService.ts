import {
  arrayRemove,
  deleteDoc,
  doc,
  getDoc,
  orderBy,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";
import { firebaseStorage, firestore } from "@/lib/firebase/client";
import { checkFile, safeFileName } from "@/lib/files";
import type { Material, MaterialCategory, Page, Visibility, WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { buildKeywords, searchToken } from "@/utils/keywords";
import { COLLECTIONS, chunk, clean, getById, paginate, ref, touched } from "./base";

export interface MaterialMeta {
  title: string;
  description?: string;
  category: MaterialCategory;
  courseId?: string;
  visibility: Visibility;
  studentIds: string[];
}

export interface MaterialFilters {
  category?: MaterialCategory | "all";
  search?: string;
  sort?: "recent" | "title";
}

export interface UploadHandle {
  task: UploadTask;
  /** Risolve con l'id del materiale creato. */
  done: Promise<string>;
}

function orderFor(sort: MaterialFilters["sort"]): QueryConstraint {
  return sort === "title" ? orderBy("title", "asc") : orderBy("createdAt", "desc");
}

function filterConstraints(f: MaterialFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (f.category && f.category !== "all") c.push(where("category", "==", f.category));
  const token = f.search ? searchToken(f.search) : null;
  if (token) c.push(where("keywords", "array-contains", token));
  c.push(orderFor(f.sort));
  return c;
}

/** Cursori separati per le tre "sorgenti" di materiali visibili allo studente. */
export interface StudentMaterialCursor {
  all: unknown | null;
  course: unknown | null;
  student: unknown | null;
  done: { all: boolean; course: boolean; student: boolean };
}

export const materialService = {
  get: (id: string) => getById<Material>(COLLECTIONS.materials, id),

  /** Lettura puntuale (lo studente riceve solo quelli che le rules gli consentono). */
  async getMany(ids: string[]): Promise<WithId<Material>[]> {
    const snaps = await Promise.allSettled(ids.map((id) => getDoc(doc(firestore(), COLLECTIONS.materials, id))));
    return snaps.flatMap((s) =>
      s.status === "fulfilled" && s.value.exists() ? [{ id: s.value.id, ...(s.value.data() as Material) }] : [],
    );
  },

  // ── Docente ──
  page: (filters: MaterialFilters, cursor: unknown | null) =>
    paginate<Material>(COLLECTIONS.materials, filterConstraints(filters), cursor, 20),

  /** Docente: materiali assegnati personalmente a uno studente. */
  pageAssignedTo: (studentId: string, cursor: unknown | null) =>
    paginate<Material>(
      COLLECTIONS.materials,
      [where("studentIds", "array-contains", studentId), orderBy("createdAt", "desc")],
      cursor,
      20,
    ),

  // ── Studente: unione di tre query compatibili con le rules ──
  async pageForStudent(
    studentId: string,
    courseIds: string[],
    filters: MaterialFilters,
    cursor: StudentMaterialCursor | null,
  ): Promise<{ items: WithId<Material>[]; cursor: StudentMaterialCursor | null }> {
    const base = filterConstraints(filters);
    const state: StudentMaterialCursor = cursor ?? {
      all: null,
      course: null,
      student: null,
      done: { all: false, course: courseIds.length === 0, student: false },
    };
    const size = 12;
    const empty: Page<Material> = { items: [], cursor: null };
    const [all, course, student] = await Promise.all([
      state.done.all ? empty : paginate<Material>(COLLECTIONS.materials, [where("visibility", "==", "all"), ...base], state.all, size),
      state.done.course
        ? empty
        : paginate<Material>(
            COLLECTIONS.materials,
            // Limite Firestore: 30 valori per `in` (una scuola privata ne ha molti meno).
            [where("visibility", "==", "course"), where("courseId", "in", chunk(courseIds)[0] ?? ["-"]), ...base],
            state.course,
            size,
          ),
      state.done.student
        ? empty
        : paginate<Material>(
            COLLECTIONS.materials,
            filters.search
              ? // un solo array-contains per query: la ricerca per gli assegnati personali si filtra lato client
                [where("studentIds", "array-contains", studentId), orderFor(filters.sort)]
              : [where("studentIds", "array-contains", studentId), ...base],
            state.student,
            size,
          ),
    ]);

    const token = filters.search ? searchToken(filters.search) : null;
    const studentItems = token ? student.items.filter((m) => m.keywords?.includes(token)) : student.items;
    const seen = new Set<string>();
    const items = [...all.items, ...course.items, ...studentItems].filter((m) => !seen.has(m.id) && seen.add(m.id));
    items.sort((a, b) =>
      filters.sort === "title"
        ? a.title.localeCompare(b.title, "it")
        : (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
    );

    const next: StudentMaterialCursor = {
      all: all.cursor,
      course: course.cursor,
      student: student.cursor,
      done: { all: !all.cursor, course: !course.cursor, student: !student.cursor },
    };
    const finished = next.done.all && next.done.course && next.done.student;
    return { items, cursor: finished ? null : next };
  },

  /**
   * Upload reale (§25): Storage → URL → documento Firestore. Non blocca la UI:
   * il chiamante osserva `task` per progresso/annullamento.
   */
  upload(file: File, meta: MaterialMeta, createdBy: string): UploadHandle {
    const check = checkFile(file);
    if (!check.ok) throw new AppError(check.error);
    const id = doc(ref(COLLECTIONS.materials, "_").parent).id;
    const storagePath = `materials/${id}/${safeFileName(file.name)}`;
    const sRef = storageRef(firebaseStorage(), storagePath);
    const task = uploadBytesResumable(sRef, file, { contentType: check.contentType });

    const done = new Promise<string>((resolve, reject) => {
      task.then(
        async () => {
          try {
            // Markdown: il testo va nel documento, così il viewer non dipende dal CORS del bucket.
            const content = check.type === "markdown" ? await file.text() : undefined;
            await setDoc(
              ref(COLLECTIONS.materials, id),
              clean({
                ...meta,
                courseId: meta.courseId || undefined,
                studentIds: meta.studentIds,
                type: check.type,
                storagePath,
                fileName: file.name,
                contentType: check.contentType,
                size: file.size,
                content,
                createdBy,
                keywords: buildKeywords(meta.title, meta.description, meta.category),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
            resolve(id);
          } catch (e) {
            // Documento non creato: rimuovo il file orfano.
            await deleteObject(sRef).catch(() => undefined);
            reject(e);
          }
        },
        reject,
      );
    });
    return { task, done };
  },

  /**
   * URL del file risolto a runtime: getDownloadURL verifica le Storage Rules.
   * Non viene salvato in Firestore (il token dell'URL bypasserebbe le rules).
   */
  fileUrl: (material: Pick<Material, "storagePath">) => getDownloadURL(storageRef(firebaseStorage(), material.storagePath)),

  /** Contenuto del file, per salvarlo sul dispositivo. Richiede il CORS sul bucket (storage.cors.json). */
  fileBlob: (material: Pick<Material, "storagePath">) => getBlob(storageRef(firebaseStorage(), material.storagePath)),

  update: (id: string, meta: MaterialMeta) =>
    updateDoc(
      ref(COLLECTIONS.materials, id),
      clean({
        ...meta,
        courseId: meta.courseId || "",
        studentIds: meta.studentIds,
        keywords: buildKeywords(meta.title, meta.description, meta.category),
        ...touched(),
      }),
    ),

  async remove(material: WithId<Material>) {
    await deleteDoc(ref(COLLECTIONS.materials, material.id));
    await deleteObject(storageRef(firebaseStorage(), material.storagePath)).catch(() => undefined);
  },

  /** Assegnazione additiva: `studentIds` rende il materiale visibile a quegli studenti qualunque sia la visibilità. */
  assignToStudents: (material: WithId<Material>, studentIds: string[]) =>
    updateDoc(ref(COLLECTIONS.materials, material.id), {
      studentIds: Array.from(new Set([...(material.studentIds ?? []), ...studentIds])),
      ...touched(),
    }),

  /** Revoca l'assegnazione personale (resta visibile solo se è per tutti o per il corso dello studente). */
  unassignFromStudent: (materialId: string, studentId: string) =>
    updateDoc(ref(COLLECTIONS.materials, materialId), { studentIds: arrayRemove(studentId), ...touched() }),
};
