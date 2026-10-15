import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, orderBy, updateDoc, where, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Material, MaterialFolder, Student, StudentGroup, WithId } from "@/types";
import { COLLECTIONS, chunk, clean, col, list, ref, timestamps, touched } from "./base";

export interface GroupInput {
  name: string;
  description?: string;
  /** Corso del gruppo; vuoto = nessun corso. */
  courseId?: string;
  /** Studenti che devono far parte del gruppo. */
  memberIds: string[];
}

/** Gruppi di studenti (ADR D26). L'appartenenza sta in `students.groupIds`: uno studente può stare in più gruppi. */
export const groupService = {
  list: () => list<StudentGroup>(COLLECTIONS.groups, orderBy("name")),

  /** Lettura puntuale: lo studente riceve solo i gruppi di cui fa parte (rules). */
  async getMany(ids: string[]): Promise<WithId<StudentGroup>[]> {
    const snaps = await Promise.allSettled(ids.map((id) => getDoc(doc(firestore(), COLLECTIONS.groups, id))));
    return snaps.flatMap((s) =>
      s.status === "fulfilled" && s.value.exists() ? [{ id: s.value.id, ...(s.value.data() as StudentGroup) }] : [],
    );
  },

  /**
   * Crea o aggiorna un gruppo e allinea i membri. `currentMemberIds` sono i membri prima della modifica
   * (tra gli studenti mostrati nel form): solo le differenze vengono scritte.
   */
  async save(group: WithId<StudentGroup> | null, input: GroupInput, currentMemberIds: string[], createdBy: string) {
    const batch = writeBatch(firestore());
    const groupRef = group ? ref(COLLECTIONS.groups, group.id) : doc(col(COLLECTIONS.groups));
    const details = { name: input.name, description: input.description ?? "", courseId: input.courseId ?? "" };
    if (group) batch.update(groupRef, { ...details, ...touched() });
    else batch.set(groupRef, clean({ ...details, createdBy, ...timestamps() }));

    const added = input.memberIds.filter((id) => !currentMemberIds.includes(id));
    const removed = currentMemberIds.filter((id) => !input.memberIds.includes(id));
    for (const id of added) batch.update(ref(COLLECTIONS.students, id), { groupIds: arrayUnion(groupRef.id), ...touched() });
    for (const id of removed) batch.update(ref(COLLECTIONS.students, id), { groupIds: arrayRemove(groupRef.id), ...touched() });
    await batch.commit();
    return groupRef.id;
  },

  /** Gruppi di uno studente, dalla sua scheda: sostituisce l'elenco intero. */
  setForStudent: (studentId: string, groupIds: string[]) =>
    updateDoc(ref(COLLECTIONS.students, studentId), { groupIds: [...new Set(groupIds)], ...touched() }),

  /** Elimina il gruppo e lo toglie da studenti, materiali e cartelle a cui era assegnato. */
  async remove(id: string) {
    const [students, materials, folders] = await Promise.all([
      list<Student>(COLLECTIONS.students, where("groupIds", "array-contains", id)),
      list<Material>(COLLECTIONS.materials, where("audience", "array-contains", id)),
      list<MaterialFolder>(COLLECTIONS.materialFolders, where("audience", "array-contains", id)),
    ]);
    const unshare = { groupIds: arrayRemove(id), audience: arrayRemove(id), ...touched() };
    const writes = [
      ...students.map((s) => ({ ref: ref(COLLECTIONS.students, s.id), data: { groupIds: arrayRemove(id), ...touched() } })),
      ...materials.map((m) => ({ ref: ref(COLLECTIONS.materials, m.id), data: unshare })),
      ...folders.map((f) => ({ ref: ref(COLLECTIONS.materialFolders, f.id), data: unshare })),
    ];
    // Limite di 500 scritture per batch.
    for (const part of chunk(writes, 400)) {
      const batch = writeBatch(firestore());
      part.forEach((w) => batch.update(w.ref, w.data));
      await batch.commit();
    }
    await deleteDoc(ref(COLLECTIONS.groups, id));
  },
};

export type GroupMap = Map<string, WithId<StudentGroup>>;
export const toGroupMap = (groups: WithId<StudentGroup>[] = []): GroupMap => new Map(groups.map((g) => [g.id, g]));
