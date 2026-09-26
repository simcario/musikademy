import { addDoc, deleteDoc, orderBy, serverTimestamp, updateDoc, where, limit } from "firebase/firestore";
import type { Announcement, AnnouncementTarget, WithId } from "@/types";
import { buildKeywords } from "@/utils/keywords";
import { COLLECTIONS, chunk, clean, col, list, paginate, ref, touched } from "./base";

export interface AnnouncementInput {
  title: string;
  content: string;
  targetType: AnnouncementTarget;
  targetId?: string;
}

export const announcementService = {
  /**
   * Studente: unione delle comunicazioni pertinenti (tutti, suoi corsi, personali).
   * Tre query compatibili con le rules, unite e ordinate per data.
   */
  async listForStudent(studentId: string, courseIds: string[], max = 30): Promise<WithId<Announcement>[]> {
    const newest = [orderBy("publishedAt", "desc"), limit(max)];
    const [all, personal, ...byCourse] = await Promise.all([
      list<Announcement>(COLLECTIONS.announcements, where("targetType", "==", "all"), ...newest),
      list<Announcement>(
        COLLECTIONS.announcements,
        where("targetType", "==", "student"),
        where("targetId", "==", studentId),
        ...newest,
      ),
      ...chunk(courseIds).map((ids) =>
        list<Announcement>(
          COLLECTIONS.announcements,
          where("targetType", "==", "course"),
          where("targetId", "in", ids),
          ...newest,
        ),
      ),
    ]);
    return [...all, ...personal, ...byCourse.flat()]
      .sort((a, b) => (b.publishedAt?.toMillis() ?? 0) - (a.publishedAt?.toMillis() ?? 0))
      .slice(0, max);
  },

  page: (cursor: unknown | null) =>
    paginate<Announcement>(COLLECTIONS.announcements, [orderBy("publishedAt", "desc")], cursor, 20),

  async create(input: AnnouncementInput, author: { uid: string; name: string }) {
    const r = await addDoc(
      col(COLLECTIONS.announcements),
      clean({
        ...input,
        targetId: input.targetType === "all" ? undefined : input.targetId,
        createdBy: author.uid,
        authorName: author.name,
        attachments: [],
        keywords: buildKeywords(input.title, input.content.slice(0, 200)),
        publishedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    return r.id;
  },

  update: (id: string, input: AnnouncementInput) =>
    updateDoc(ref(COLLECTIONS.announcements, id), {
      ...input,
      targetId: input.targetType === "all" ? "" : (input.targetId ?? ""),
      keywords: buildKeywords(input.title, input.content.slice(0, 200)),
      ...touched(),
    }),

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.announcements, id)),
};
