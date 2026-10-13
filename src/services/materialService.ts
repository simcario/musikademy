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
  listAll,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";
import { firebaseStorage, firestore } from "@/lib/firebase/client";
import { MARKDOWN_MAX_SIZE, assetImageName, checkFile, dirOf, isAssetImage, safeFileName } from "@/lib/files";
import type { Material, MaterialCategory, Page, Visibility, WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { buildKeywords, searchToken } from "@/utils/keywords";
import { COLLECTIONS, chunk, clean, getById, paginate, ref, touched } from "./base";
import { folderService, materialAudience } from "./folderService";

export interface MaterialMeta {
  title: string;
  description?: string;
  category: MaterialCategory;
  courseId?: string;
  visibility: Visibility;
  studentIds: string[];
  groupIds?: string[];
  folderId?: string;
}

export type MaterialDetails = Pick<MaterialMeta, "title" | "description" | "category">;
export type MaterialAssignment = Pick<MaterialMeta, "courseId" | "visibility" | "studentIds" | "groupIds">;

export interface MaterialFilters {
  category?: MaterialCategory | "all";
  /** Solo i materiali di questa cartella. */
  folderId?: string;
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
  if (f.folderId) c.push(where("folderId", "==", f.folderId));
  if (f.category && f.category !== "all") c.push(where("category", "==", f.category));
  const token = f.search ? searchToken(f.search) : null;
  if (token) c.push(where("keywords", "array-contains", token));
  c.push(orderFor(f.sort));
  return c;
}

/** "Sorgenti" dei materiali visibili allo studente: ognuna è una query compatibile con le rules. */
const STUDENT_SOURCES = ["all", "course", "student", "shared"] as const;
type StudentSource = (typeof STUDENT_SOURCES)[number];

/** Cursori separati per ogni sorgente. */
export interface StudentMaterialCursor {
  next: Record<StudentSource, unknown | null>;
  done: Record<StudentSource, boolean>;
}

/** Cosa mostrare allo studente: tutto ciò che può vedere, oppure solo un suo gruppo o corso. */
export interface StudentMaterialScope {
  courseIds: string[];
  /** UID e gruppi con cui un materiale (o la sua cartella) può essere condiviso: campo `audience`. */
  audienceIds: string[];
  /** Include i materiali per tutti e quelli assegnati personalmente. */
  personal: boolean;
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

  // ── Studente: unione di più query compatibili con le rules ──
  async pageForStudent(
    studentId: string,
    scope: StudentMaterialScope,
    filters: MaterialFilters,
    cursor: StudentMaterialCursor | null,
  ): Promise<{ items: WithId<Material>[]; cursor: StudentMaterialCursor | null }> {
    const base = filterConstraints(filters);
    // Un solo array-contains per query: dove ce n'è già uno la ricerca si filtra lato client.
    const noSearch = filterConstraints({ ...filters, search: undefined });
    // Limite Firestore: 30 valori per `in` / `array-contains-any` (una scuola privata ne ha molti meno).
    const courseIds = chunk(scope.courseIds)[0] ?? [];
    const audienceIds = chunk(scope.audienceIds)[0] ?? [];
    // In una cartella condivisa ogni materiale ha la condivisione della cartella in `audience`.
    const inFolder = !!filters.folderId;
    const personal = scope.personal && !inFolder;
    const queries: Record<StudentSource, QueryConstraint[] | null> = {
      all: personal ? [where("visibility", "==", "all"), ...base] : null,
      course:
        courseIds.length && !inFolder
          ? [where("visibility", "==", "course"), where("courseId", "in", courseIds), ...base]
          : null,
      student: personal ? [where("studentIds", "array-contains", studentId), ...noSearch] : null,
      shared: audienceIds.length ? [where("audience", "array-contains-any", audienceIds), ...noSearch] : null,
    };
    const state: StudentMaterialCursor = cursor ?? {
      next: { all: null, course: null, student: null, shared: null },
      done: { all: !queries.all, course: !queries.course, student: !queries.student, shared: !queries.shared },
    };
    const empty: Page<Material> = { items: [], cursor: null };
    const pages = await Promise.all(
      STUDENT_SOURCES.map((s) => {
        const q = queries[s];
        return !q || state.done[s] ? empty : paginate<Material>(COLLECTIONS.materials, q, state.next[s], 12);
      }),
    );

    const token = filters.search ? searchToken(filters.search) : null;
    const seen = new Set<string>();
    const items = pages
      .flatMap((p) => p.items)
      .filter((m) => (!token || m.keywords?.includes(token)) && !seen.has(m.id) && seen.add(m.id));
    items.sort((a, b) =>
      filters.sort === "title"
        ? a.title.localeCompare(b.title, "it")
        : (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
    );

    const next = { ...state.next };
    const done = { ...state.done };
    STUDENT_SOURCES.forEach((s, i) => {
      next[s] = pages[i].cursor;
      done[s] = !pages[i].cursor;
    });
    return { items, cursor: STUDENT_SOURCES.every((s) => done[s]) ? null : { next, done } };
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
            const folder = meta.folderId ? await folderService.get(meta.folderId) : null;
            const groupIds = meta.groupIds ?? [];
            await setDoc(
              ref(COLLECTIONS.materials, id),
              clean({
                ...meta,
                courseId: meta.courseId || undefined,
                studentIds: meta.studentIds,
                groupIds,
                folderId: folder?.id ?? "",
                audience: materialAudience(groupIds, folder),
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

  /**
   * Modifica del documento: titolo, descrizione, categoria e, per i Markdown, il testo (`content`).
   * Il testo viene riscritto anche nel file su Storage, così download e dimensione restano allineati.
   */
  async updateDetails(material: WithId<Material>, details: MaterialDetails, content?: string) {
    let file: { content?: string; size?: number } = {};
    if (content !== undefined) {
      const blob = new Blob([content], { type: material.contentType });
      if (blob.size > MARKDOWN_MAX_SIZE) throw new AppError("Documento troppo lungo: il limite è 512 KB.");
      await uploadBytes(storageRef(firebaseStorage(), material.storagePath), blob, { contentType: material.contentType });
      file = { content, size: blob.size };
    }
    await updateDoc(
      ref(COLLECTIONS.materials, material.id),
      clean({
        ...details,
        ...file,
        keywords: buildKeywords(details.title, details.description, details.category),
        ...touched(),
      }),
    );
    if (content !== undefined) await this.pruneImages(material, content).catch(() => undefined);
  },

  /** Assegnazione: a chi è visibile il materiale (la condivisione della sua cartella resta valida). */
  async updateAssignment(material: Pick<WithId<Material>, "id" | "folderId">, a: MaterialAssignment) {
    const folder = material.folderId ? await folderService.get(material.folderId) : null;
    const groupIds = a.groupIds ?? [];
    await updateDoc(ref(COLLECTIONS.materials, material.id), {
      visibility: a.visibility,
      courseId: a.courseId || "",
      studentIds: a.studentIds,
      groupIds,
      audience: materialAudience(groupIds, folder),
      ...touched(),
    });
  },

  /** Sposta il materiale in una cartella (`null` = nessuna): ne eredita la condivisione. */
  async moveToFolder(material: Pick<WithId<Material>, "id" | "groupIds">, folderId: string | null) {
    const folder = folderId ? await folderService.get(folderId) : null;
    await updateDoc(ref(COLLECTIONS.materials, material.id), {
      folderId: folder?.id ?? "",
      audience: materialAudience(material.groupIds, folder),
      ...touched(),
    });
  },

  // ── Immagini inserite nei Markdown (vedi isAssetImage) ──
  /** Carica un'immagine accanto al file del materiale e ne restituisce il nome, da usare nel testo. */
  async uploadImage(material: Pick<Material, "storagePath">, file: File): Promise<string> {
    const check = checkFile(file);
    if (!check.ok) throw new AppError(check.error);
    if (check.type !== "image") throw new AppError("Puoi inserire solo immagini JPG, PNG o WEBP.");
    const name = assetImageName(file.name);
    await uploadBytes(storageRef(firebaseStorage(), `${dirOf(material.storagePath)}/${name}`), file, {
      contentType: check.contentType,
    });
    return name;
  },

  imageUrl: (assetDir: string, name: string) => getDownloadURL(storageRef(firebaseStorage(), `${assetDir}/${name}`)),

  /** Elimina da Storage le immagini caricate che `content` non usa più. */
  async pruneImages(material: Pick<Material, "storagePath">, content: string) {
    const { items } = await listAll(storageRef(firebaseStorage(), dirOf(material.storagePath)));
    await Promise.all(
      items.filter((i) => isAssetImage(i.name) && !content.includes(i.name)).map((i) => deleteObject(i).catch(() => undefined)),
    );
  },

  async remove(material: WithId<Material>) {
    await deleteDoc(ref(COLLECTIONS.materials, material.id));
    await deleteObject(storageRef(firebaseStorage(), material.storagePath)).catch(() => undefined);
    await this.pruneImages(material, "").catch(() => undefined);
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
