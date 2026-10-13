import { addDoc, deleteDoc, orderBy, updateDoc, where, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Material, MaterialFolder, WithId } from "@/types";
import { COLLECTIONS, chunk, col, getById, list, ref, timestamps, touched } from "./base";

export interface FolderSharing {
  studentIds: string[];
  groupIds: string[];
}

const unique = (ids: string[]) => Array.from(new Set(ids));

/** Con chi è condivisa una cartella: singoli studenti e gruppi. */
export const folderAudience = (f: FolderSharing) => unique([...f.studentIds, ...f.groupIds]);

/**
 * `audience` di un materiale (ADR D26): i suoi gruppi + studenti e gruppi della cartella che lo contiene.
 * Va ricalcolato ogni volta che cambiano i gruppi del materiale, la sua cartella o la condivisione della cartella.
 */
export const materialAudience = (groupIds: string[] = [], folder?: FolderSharing | null) =>
  unique([...groupIds, ...(folder ? folderAudience(folder) : [])]);

/** Cartelle di materiali (ADR D26): un livello solo, condivisibili con studenti e gruppi. */
export const folderService = {
  get: (id: string) => getById<MaterialFolder>(COLLECTIONS.materialFolders, id),

  // ── Docente ──
  list: () => list<MaterialFolder>(COLLECTIONS.materialFolders, orderBy("name")),

  // ── Studente: cartelle condivise con lui o con uno dei suoi gruppi ──
  async listShared(audienceIds: string[]) {
    if (audienceIds.length === 0) return [];
    const folders = await list<MaterialFolder>(
      COLLECTIONS.materialFolders,
      where("audience", "array-contains-any", chunk(audienceIds)[0]),
    );
    return folders.sort((a, b) => a.name.localeCompare(b.name, "it"));
  },

  async create(name: string, createdBy: string) {
    const r = await addDoc(col(COLLECTIONS.materialFolders), {
      name,
      studentIds: [],
      groupIds: [],
      audience: [],
      createdBy,
      ...timestamps(),
    });
    return r.id;
  },

  rename: (id: string, name: string) => updateDoc(ref(COLLECTIONS.materialFolders, id), { name, ...touched() }),

  /** Condivisione: aggiorna la cartella e l'`audience` di tutti i materiali che contiene. */
  async share(id: string, sharing: FolderSharing) {
    const materials = await list<Material>(COLLECTIONS.materials, where("folderId", "==", id));
    await updateDoc(ref(COLLECTIONS.materialFolders, id), {
      studentIds: sharing.studentIds,
      groupIds: sharing.groupIds,
      audience: folderAudience(sharing),
      ...touched(),
    });
    await updateMaterials(materials, (m) => ({ audience: materialAudience(m.groupIds, sharing) }));
  },

  /** Elimina la cartella: i materiali restano, fuori da ogni cartella e senza la sua condivisione. */
  async remove(id: string) {
    const materials = await list<Material>(COLLECTIONS.materials, where("folderId", "==", id));
    await updateMaterials(materials, (m) => ({ folderId: "", audience: materialAudience(m.groupIds) }));
    await deleteDoc(ref(COLLECTIONS.materialFolders, id));
  },
};

async function updateMaterials(materials: WithId<Material>[], patch: (m: WithId<Material>) => Record<string, unknown>) {
  // Limite di 500 scritture per batch.
  for (const part of chunk(materials, 400)) {
    const batch = writeBatch(firestore());
    part.forEach((m) => batch.update(ref(COLLECTIONS.materials, m.id), { ...patch(m), ...touched() }));
    await batch.commit();
  }
}

export type FolderMap = Map<string, WithId<MaterialFolder>>;
export const toFolderMap = (folders: WithId<MaterialFolder>[] = []): FolderMap => new Map(folders.map((f) => [f.id, f]));
