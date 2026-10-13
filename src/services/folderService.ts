import { doc, orderBy, where, writeBatch, type DocumentReference } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Material, MaterialFolder, WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { COLLECTIONS, chunk, col, getById, list, ref, timestamps, touched } from "./base";

export interface FolderSharing {
  studentIds: string[];
  groupIds: string[];
}

type Folder = WithId<MaterialFolder>;
type Write = { ref: DocumentReference; data: Record<string, unknown> | null };

const unique = (ids: string[]) => Array.from(new Set(ids));

/**
 * `audience` di un materiale (ADR D26): i suoi gruppi + l'`audience` della cartella che lo contiene
 * (che comprende già quella delle cartelle superiori). Va ricalcolato ogni volta che cambiano i gruppi
 * del materiale, la sua cartella o la condivisione di una cartella sopra di lui.
 */
export const materialAudience = (groupIds: string[] = [], folder?: Pick<MaterialFolder, "audience"> | null) =>
  unique([...groupIds, ...(folder?.audience ?? [])]);

export type FolderMap = Map<string, Folder>;
export const toFolderMap = (folders: Folder[] = []): FolderMap => new Map(folders.map((f) => [f.id, f]));

/** Cartella superiore tra quelle note; `""` = primo livello (anche se la superiore non è visibile). */
export const parentIdOf = (f: Pick<MaterialFolder, "parentId">, map: FolderMap) =>
  f.parentId && map.has(f.parentId) ? f.parentId : "";

/** Percorso dalla cartella di primo livello fino a `id` compresa. */
export function folderPath(id: string, map: FolderMap): Folder[] {
  const path: Folder[] = [];
  for (let f = map.get(id); f && !path.includes(f); f = f.parentId ? map.get(f.parentId) : undefined) path.unshift(f);
  return path;
}

export const folderPathName = (id: string, map: FolderMap) =>
  folderPath(id, map)
    .map((f) => f.name)
    .join(" / ");

/** Cartelle ordinate per percorso ("Coro", "Coro / Bassi", …), per i selettori. */
export const foldersByPath = (folders: Folder[] = []) => {
  const map = toFolderMap(folders);
  return folders
    .map((f) => ({ folder: f, path: folderPathName(f.id, map) }))
    .sort((a, b) => a.path.localeCompare(b.path, "it"));
};

/** `id` e tutte le sue sottocartelle, a ogni livello. */
export function subtreeIds(id: string, folders: Folder[]): Set<string> {
  const ids = new Set([id]);
  const visit = (parent: string) =>
    folders.forEach((f) => {
      if (f.parentId === parent && !ids.has(f.id)) {
        ids.add(f.id);
        visit(f.id);
      }
    });
  visit(id);
  return ids;
}

/**
 * Scritture che riallineano `root` e tutto ciò che contiene: l'`audience` di ogni cartella è la sua
 * condivisione più quella ereditata dalla superiore, e i materiali la ricevono dalla loro cartella.
 * `folders` è lo stato già modificato in memoria (condivisione o posizione nuove).
 */
async function subtreeWrites(root: Folder, folders: Folder[]): Promise<Write[]> {
  const map = toFolderMap(folders);
  const audiences = new Map<string, string[]>();
  const order: Folder[] = [];
  const visit = (f: Folder) => {
    if (audiences.has(f.id)) return;
    const parent = f.parentId ? map.get(f.parentId) : undefined;
    const inherited = parent ? (audiences.get(parent.id) ?? parent.audience ?? []) : [];
    audiences.set(f.id, unique([...(f.studentIds ?? []), ...(f.groupIds ?? []), ...inherited]));
    order.push(f);
    folders.filter((c) => c.parentId === f.id).forEach(visit);
  };
  visit(root);

  const writes: Write[] = order.map((f) => ({
    ref: ref(COLLECTIONS.materialFolders, f.id),
    data: {
      parentId: f.parentId ?? "",
      studentIds: f.studentIds ?? [],
      groupIds: f.groupIds ?? [],
      audience: audiences.get(f.id),
      ...touched(),
    },
  }));
  // Limite Firestore: 30 valori per `in`.
  for (const ids of chunk(order.map((f) => f.id))) {
    const materials = await list<Material>(COLLECTIONS.materials, where("folderId", "in", ids));
    materials.forEach((m) =>
      writes.push({
        ref: ref(COLLECTIONS.materials, m.id),
        data: { audience: materialAudience(m.groupIds, { audience: audiences.get(m.folderId ?? "") ?? [] }), ...touched() },
      }),
    );
  }
  return writes;
}

/** `data: null` = eliminazione. Limite di 500 scritture per batch. */
async function commit(writes: Write[]) {
  for (const part of chunk(writes, 400)) {
    const batch = writeBatch(firestore());
    part.forEach((w) => (w.data ? batch.update(w.ref, w.data) : batch.delete(w.ref)));
    await batch.commit();
  }
}

async function loadWith(id: string) {
  const folders = await folderService.list();
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new AppError("Cartella non trovata.");
  return { folders, folder };
}

/** Cartelle di materiali (ADR D26): annidabili, condivisibili con studenti e gruppi. */
export const folderService = {
  get: (id: string) => getById<MaterialFolder>(COLLECTIONS.materialFolders, id),

  // ── Docente ──
  list: () => list<MaterialFolder>(COLLECTIONS.materialFolders, orderBy("name")),

  // ── Studente: cartelle condivise con lui o con uno dei suoi gruppi (anche tramite una superiore) ──
  async listShared(audienceIds: string[]) {
    if (audienceIds.length === 0) return [];
    const folders = await list<MaterialFolder>(
      COLLECTIONS.materialFolders,
      where("audience", "array-contains-any", chunk(audienceIds)[0]),
    );
    return folders.sort((a, b) => a.name.localeCompare(b.name, "it"));
  },

  /** Nuova cartella, al primo livello o dentro `parentId`: ne eredita la condivisione. */
  async create(name: string, parentId: string | null, createdBy: string) {
    const parent = parentId ? await this.get(parentId) : null;
    const r = doc(col(COLLECTIONS.materialFolders));
    const batch = writeBatch(firestore());
    batch.set(r, {
      name,
      parentId: parent?.id ?? "",
      studentIds: [],
      groupIds: [],
      audience: parent?.audience ?? [],
      createdBy,
      ...timestamps(),
    });
    await batch.commit();
    return r.id;
  },

  async rename(id: string, name: string) {
    await commit([{ ref: ref(COLLECTIONS.materialFolders, id), data: { name, ...touched() } }]);
  },

  /** Condivisione: vale per la cartella, le sue sottocartelle e tutti i materiali che contengono. */
  async share(id: string, sharing: FolderSharing) {
    const { folders, folder } = await loadWith(id);
    Object.assign(folder, sharing);
    await commit(await subtreeWrites(folder, folders));
  },

  /** Sposta la cartella dentro `parentId` (`null` = primo livello): eredita la condivisione della nuova posizione. */
  async move(id: string, parentId: string | null) {
    const { folders, folder } = await loadWith(id);
    if (parentId && subtreeIds(id, folders).has(parentId)) {
      throw new AppError("Non puoi spostare una cartella dentro se stessa o una sua sottocartella.");
    }
    if (parentId && !folders.some((f) => f.id === parentId)) throw new AppError("Cartella di destinazione non trovata.");
    folder.parentId = parentId ?? "";
    await commit(await subtreeWrites(folder, folders));
  },

  /** Elimina la cartella: materiali e sottocartelle salgono nella cartella superiore (o al primo livello). */
  async remove(id: string) {
    const { folders, folder } = await loadWith(id);
    const parent = folder.parentId ? (folders.find((f) => f.id === folder.parentId) ?? null) : null;
    const rest = folders.filter((f) => f.id !== id);
    const writes: Write[] = [];
    for (const child of rest.filter((f) => f.parentId === id)) {
      child.parentId = parent?.id ?? "";
      writes.push(...(await subtreeWrites(child, rest)));
    }
    const materials = await list<Material>(COLLECTIONS.materials, where("folderId", "==", id));
    materials.forEach((m) =>
      writes.push({
        ref: ref(COLLECTIONS.materials, m.id),
        data: { folderId: parent?.id ?? "", audience: materialAudience(m.groupIds, parent), ...touched() },
      }),
    );
    writes.push({ ref: ref(COLLECTIONS.materialFolders, id), data: null });
    await commit(writes);
  },
};
