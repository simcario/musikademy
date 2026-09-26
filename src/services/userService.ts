import { orderBy, updateDoc, where, writeBatch } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { firestore, firebaseStorage } from "@/lib/firebase/client";
import { AVATAR_MAX_SIZE, safeFileName } from "@/lib/files";
import type { AppUser, Course, Student, Teacher, WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { buildKeywords } from "@/utils/keywords";
import { COLLECTIONS, clean, getById, list, ref, timestamps, touched } from "./base";

export interface ProfileInput {
  name: string;
  surname: string;
  phone?: string;
}

export const userService = {
  get: (uid: string) => getById<AppUser>(COLLECTIONS.users, uid),

  /** Lo studente può modificare solo nome, cognome, telefono e foto (vincolato anche da firestore.rules). */
  updateProfile(uid: string, input: ProfileInput) {
    return updateDoc(ref(COLLECTIONS.users, uid), clean({ ...input, phone: input.phone || "", ...touched() }));
  },

  async uploadAvatar(uid: string, file: File): Promise<string> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new AppError("Usa un'immagine JPG, PNG o WEBP.");
    }
    if (file.size > AVATAR_MAX_SIZE) throw new AppError("Immagine troppo grande (massimo 5 MB).");
    const path = `users/${uid}/avatar/${Date.now()}-${safeFileName(file.name)}`;
    const r = storageRef(firebaseStorage(), path);
    await uploadBytes(r, file, { contentType: file.type });
    const url = await getDownloadURL(r);
    await updateDoc(ref(COLLECTIONS.users, uid), { photoURL: url, ...touched() });
    return url;
  },
};

export const teacherService = {
  list: () => list<Teacher>(COLLECTIONS.teachers, orderBy("surname")),
  get: (uid: string) => getById<Teacher>(COLLECTIONS.teachers, uid),
};

export interface CourseInput {
  name: string;
  description?: string;
  active: boolean;
  teacherIds: string[];
}

export const courseService = {
  list: () => list<Course>(COLLECTIONS.courses, orderBy("name")),
  listActive: () => list<Course>(COLLECTIONS.courses, where("active", "==", true), orderBy("name")),

  async create(input: CourseInput) {
    const batch = writeBatch(firestore());
    const r = ref(COLLECTIONS.courses, crypto.randomUUID());
    batch.set(r, clean({ ...input, ...timestamps() }));
    await batch.commit();
    return r.id;
  },

  update: (id: string, input: Partial<CourseInput>) =>
    updateDoc(ref(COLLECTIONS.courses, id), clean({ ...input, ...touched() })),
};

export function studentKeywords(s: Pick<Student, "name" | "surname" | "email">) {
  return buildKeywords(s.name, s.surname, s.email);
}

export type CourseMap = Map<string, WithId<Course>>;
export const toCourseMap = (courses: WithId<Course>[] = []): CourseMap => new Map(courses.map((c) => [c.id, c]));
