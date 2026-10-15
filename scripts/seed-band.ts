/**
 * Dati DEMO "band / worship team" (per screenshot e video promo), da lanciare DOPO `npm run seed`:
 *   node --require ./scripts/exfat-fs-patch.cjs node_modules/tsx/dist/cli.mjs scripts/seed-band.ts
 *
 * Crea il corso "Worship Team" con i gruppi Voci / Ritmica / Tastiere, 4 musicisti (più Elena nelle Voci),
 * 4 brani con parti diverse per gruppo (ADR D29), testi associati alle tracce guida (D27), la playlist
 * "Scaletta di domenica" con note per brano, due prove con presenze e una comunicazione.
 * I campi derivati (`audience`, `playlistAudience`) sono calcolati come in playlistService/folderService.
 * Solo emulatori, come il seed principale.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { buildKeywords } from "../src/utils/keywords";
import { initAdmin, usingEmulators } from "./lib/admin-env";
import { createInviteLink } from "./lib/invite";

function day(offset: number, h = 16, m = 30) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return Timestamp.fromDate(d);
}
const unique = (a: string[]) => [...new Set(a)];

async function main() {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  const { auth, db, projectId } = initAdmin();
  if (!usingEmulators()) throw new Error("seed-band gira solo sugli emulatori.");
  console.log(`Seed band su ${projectId} (emulatori)…`);
  const now = FieldValue.serverTimestamp();
  const demo = { demo: true };
  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const admin = await auth.getUserByEmail("admin@musikademy.test").catch(() => {
    throw new Error("Prima lancia `npm run seed` (serve l'admin demo).");
  });
  const adminId = admin.uid;

  // ── Corso e gruppi ──
  const courseId = "demo-worship-team";
  await db.doc(`courses/${courseId}`).set({
    name: "Worship Team", description: "Band e voci del servizio della domenica", active: true, teacherIds: [adminId],
    createdAt: now, updatedAt: now, ...demo,
  });
  const groups = { voci: "demo-g-voci", ritmica: "demo-g-ritmica", tastiere: "demo-g-tastiere" } as const;
  const groupDefs: [string, string, string][] = [
    [groups.voci, "Voci", "Lead e seconde voci"],
    [groups.ritmica, "Ritmica", "Chitarre, basso e batteria"],
    [groups.tastiere, "Tastiere", "Piano e pad"],
  ];
  for (const [id, name, description] of groupDefs) {
    await db.doc(`groups/${id}`).set({ name, description, courseId, createdBy: adminId, createdAt: now, updatedAt: now, ...demo });
  }
  const allGroups = Object.values(groups);

  // ── Musicisti ──
  const members = [
    { email: "giulia@musikademy.test", name: "Giulia", surname: "Marino", g: [groups.voci] },
    { email: "davide@musikademy.test", name: "Davide", surname: "Conti", g: [groups.ritmica] },
    { email: "matteo@musikademy.test", name: "Matteo", surname: "Riva", g: [groups.ritmica] },
    { email: "sara@musikademy.test", name: "Sara", surname: "Greco", g: [groups.tastiere] },
  ];
  const memberIds: string[] = [];
  for (const m of members) {
    const user = await auth.getUserByEmail(m.email).catch(() =>
      auth.createUser({ email: m.email, displayName: `${m.name} ${m.surname}`, emailVerified: true }),
    );
    await auth.setCustomUserClaims(user.uid, { role: "student" });
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, name: m.name, surname: m.surname, email: m.email, phone: "", role: "student", active: true,
      createdAt: now, updatedAt: now, ...demo,
    });
    await db.doc(`students/${user.uid}`).set({
      userId: user.uid, name: m.name, surname: m.surname, email: m.email, phone: "", courseIds: [courseId], groupIds: m.g,
      enrollmentDate: day(-90), status: "active", keywords: buildKeywords(m.name, m.surname, m.email),
      createdAt: now, updatedAt: now, ...demo,
    });
    memberIds.push(user.uid);
  }
  // Elena (studentessa del seed principale) canta anche nel worship team.
  const elena = await auth.getUserByEmail("elena@musikademy.test");
  await db.doc(`students/${elena.uid}`).set(
    { courseIds: FieldValue.arrayUnion(courseId), groupIds: FieldValue.arrayUnion(groups.voci), updatedAt: now },
    { merge: true },
  );

  // ── Brani, materiali, testi ──
  const songs = [
    {
      id: "demo-song-luce", title: "Luce del mattino", key: "Sol", bpm: 72,
      lyrics: "## Strofa\nQuando il giorno si risveglia\nla tua luce è su di me,\nogni passo che io faccio\ntrova forza solo in te.\n\n## Ritornello\nLuce del mattino, canto per te,\nla mia voce sale, sale fino a te.\nLuce del mattino, resta con me:\nogni giorno nuovo è un dono da te.",
    },
    {
      id: "demo-song-roccia", title: "Sei la mia roccia", key: "Re", bpm: 128,
      lyrics: "## Strofa\nSe la tempesta grida forte\ne il mare cresce intorno a me,\nio non temo la mia sorte:\nresto saldo su di te.\n\n## Ritornello\nSei la mia roccia, sei il mio canto,\nla mia casa, il mio riparo.\nSei la mia roccia, io non cado:\nil tuo amore è il mio faro.",
    },
    {
      id: "demo-song-lode", title: "Canto di lode", key: "Mi", bpm: 96,
      lyrics: "## Strofa\nAlzo le mani, alzo la voce,\nogni respiro è lode per te.\n\n## Ritornello\nCanto di lode, canto d'amore,\ntutto il mio cuore lo canta per te.",
    },
    {
      id: "demo-song-mare", title: "Oltre il mare", key: "La", bpm: 68,
      lyrics: "## Strofa\nOltre il mare e oltre il cielo\nc'è una voce che mi chiama,\nè la pace che non manca,\nè la luce che non trema.\n\n## Ritornello\nTi seguirò oltre il mare,\noltre ogni mia paura.\nTi seguirò, non c'è confine\nalla tua grazia pura.",
    },
  ];

  type Mat = { id: string; title: string; category: string; type: string; file: string; ct: string; body: Buffer; content?: string; lyricsOf?: string; groupIds: string[] };
  const playlistId = "demo-playlist-domenica";
  const playlistGroups = allGroups;

  const songDocs: { id: string; items: { materialId: string; groupIds: string[] }[] }[] = [];
  const mats: Mat[] = [];
  for (const s of songs) {
    const slug = s.id.replace("demo-song-", "");
    const text: Mat = {
      id: `demo-band-${slug}-testo`, title: `${s.title} – Testo`, category: "testo", type: "markdown", file: `${slug}-testo.md`,
      ct: "text/markdown", body: Buffer.from(`# ${s.title}\n\n${s.lyrics}\n`), content: `# ${s.title}\n\n${s.lyrics}\n`, groupIds: [],
    };
    const guide: Mat = {
      id: `demo-band-${slug}-guida-voci`, title: `${s.title} – Traccia guida voci`, category: "ascolto", type: "audio",
      file: `${slug}-guida-voci.wav`, ct: "audio/wav", body: silentWav(200 + songs.indexOf(s) * 17), lyricsOf: text.id, groupIds: [groups.voci],
    };
    const base: Mat = {
      id: `demo-band-${slug}-base-ritmica`, title: `${s.title} – Base ritmica`, category: "base", type: "audio",
      file: `${slug}-base-ritmica.wav`, ct: "audio/wav", body: silentWav(200 + songs.indexOf(s) * 17), groupIds: [groups.ritmica],
    };
    const score: Mat = {
      id: `demo-band-${slug}-spartito-tastiere`, title: `${s.title} – Spartito tastiere`, category: "spartito", type: "pdf",
      file: `${slug}-spartito-tastiere.pdf`, ct: "application/pdf", body: minimalPdf(`${s.title} - Spartito tastiere`), groupIds: [groups.tastiere],
    };
    const chords: Mat = {
      id: `demo-band-${slug}-accordi`, title: `${s.title} – Accordi`, category: "spartito", type: "pdf",
      file: `${slug}-accordi.pdf`, ct: "application/pdf", body: minimalPdf(`${s.title} - Accordi`), groupIds: [groups.ritmica, groups.tastiere],
    };
    const items = [text, guide, base, score, chords];
    mats.push(...items);
    songDocs.push({ id: s.id, items: items.map((m) => ({ materialId: m.id, groupIds: m.groupIds })) });
  }

  // Derivati (ADR D29): ogni brano è nella playlist condivisa con i tre gruppi.
  const playlistAudienceOf = (materialId: string) =>
    unique(songDocs.flatMap((s) => s.items.filter((i) => i.materialId === materialId).flatMap((i) => (i.groupIds.length ? i.groupIds : playlistGroups))));

  for (const m of mats) {
    const storagePath = `materials/${m.id}/${m.file}`;
    await bucket.file(storagePath).save(m.body, { contentType: m.ct }).catch((e) => console.warn(`  (storage) ${m.file}: ${e.message}`));
    const lyricsSrc = m.lyricsOf ? mats.find((x) => x.id === m.lyricsOf) : undefined;
    const playlistAudience = playlistAudienceOf(m.id);
    await db.doc(`materials/${m.id}`).set({
      title: m.title, description: "", type: m.type, category: m.category, storagePath, fileName: m.file, contentType: m.ct,
      size: m.body.length, ...(m.content ? { content: m.content } : {}),
      ...(lyricsSrc ? { lyricsId: lyricsSrc.id, lyrics: lyricsSrc.content } : {}),
      courseId: courseId, createdBy: adminId, visibility: "student", studentIds: [], groupIds: [], folderId: "",
      playlistAudience, audience: playlistAudience,
      keywords: buildKeywords(m.title, m.category), createdAt: now, updatedAt: now, ...demo,
    });
  }

  for (const [i, s] of songs.entries()) {
    const d = songDocs[i];
    await db.doc(`songs/${s.id}`).set({
      title: s.title, artist: "Arr. Worship Team Musikademy", notes: `Tonalità ${s.key} · ${s.bpm} BPM`,
      items: d.items, materialIds: d.items.map((x) => x.materialId), audience: playlistGroups,
      createdBy: adminId, keywords: buildKeywords(s.title), createdAt: now, updatedAt: now, ...demo,
    });
  }

  const nextSunday = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return d; })();
  const sundayLabel = nextSunday.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  await db.doc(`playlists/${playlistId}`).set({
    title: `Scaletta di domenica ${sundayLabel}`, description: "Servizio delle 10:30 – arrivo ore 9:15 per il soundcheck",
    songIds: ["demo-song-lode", "demo-song-luce", "demo-song-roccia", "demo-song-mare"],
    studentIds: [], groupIds: playlistGroups, audience: playlistGroups,
    songNotes: {
      "demo-song-lode": [
        { id: "n1", text: "Apertura: intro di batteria, 4 battute", groupIds: [] },
        { id: "n2", text: "Seconde voci solo dal secondo ritornello", groupIds: [groups.voci] },
      ],
      "demo-song-luce": [
        { id: "n3", text: "Tonalità abbassata a Fa per la lead", groupIds: [] },
        { id: "n4", text: "Pad aperto sotto la strofa", groupIds: [groups.tastiere] },
      ],
      "demo-song-roccia": [{ id: "n5", text: "Finale: ritornello ripetuto 2 volte, stop sul 4", groupIds: [] }],
      "demo-song-mare": [{ id: "n6", text: "Momento di preghiera: solo piano e voce", groupIds: [] }],
    },
    createdBy: adminId, keywords: buildKeywords("Scaletta di domenica"), createdAt: now, updatedAt: now, ...demo,
  });

  // ── Prove (lezioni del corso) con presenze ──
  const band = [{ uid: elena.uid, name: "Elena Russo" }, ...members.map((m, i) => ({ uid: memberIds[i], name: `${m.name} ${m.surname}` }))];
  for (const [i, b] of band.entries()) {
    const past = `demo-band-prova-pass-${i}`;
    const next = `demo-band-prova-gen-${i}`;
    await db.doc(`lessons/${past}`).set({
      studentId: b.uid, studentName: b.name, teacherId: adminId, teacherName: "Marco Ferri", courseId,
      date: day(-4, 20), startTime: "20:00", endTime: "22:00", title: "Prova worship team", subject: "Prova",
      topics: ["Canto di lode", "Luce del mattino", "Sei la mia roccia"],
      notes: "Ritornello di «Luce del mattino» più dinamico; seconde voci un'ottava sotto.",
      materialIds: [], status: "completed", keywords: buildKeywords("Prova worship team", b.name), createdAt: now, updatedAt: now, ...demo,
    });
    await db.doc(`attendance/${past}`).set({ lessonId: past, studentId: b.uid, lessonDate: day(-4, 20), status: i === 3 ? "excused" : "present", createdAt: now, updatedAt: now, ...demo });
    await db.doc(`lessons/${next}`).set({
      studentId: b.uid, studentName: b.name, teacherId: adminId, teacherName: "Marco Ferri", courseId,
      date: day(3, 18), startTime: "18:00", endTime: "20:00", title: "Prova generale – Scaletta di domenica", subject: "Prova",
      topics: ["Scaletta completa", "Soundcheck"], notes: "", materialIds: [], status: "scheduled",
      keywords: buildKeywords("Prova generale", b.name), createdAt: now, updatedAt: now, ...demo,
    });
  }

  await db.doc("announcements/demo-band-ann").set({
    title: "Prova generale sabato alle 18:00", content: "Ripassiamo la scaletta di domenica. Portate in-ear e cavi; la batteria si monta alle 17:30.",
    targetType: "course", targetId: courseId, createdBy: adminId, authorName: "Marco Ferri", attachments: [],
    publishedAt: day(0, 9), keywords: buildKeywords("Prova generale sabato"), createdAt: now, updatedAt: now, ...demo,
  });

  console.log("\n✓ Dati band creati. Link d'invito:");
  console.log(`  admin: ${await createInviteLink(db, adminId)}`);
  console.log(`  elena: ${await createInviteLink(db, elena.uid)}`);
  console.log(`  davide (ritmica): ${await createInviteLink(db, memberIds[1])}`);
  console.log(`  sara (tastiere): ${await createInviteLink(db, memberIds[3])}`);
}

/** WAV PCM mono 8 kHz di silenzio: file valido e leggero, con una durata realistica nel player. */
function silentWav(seconds: number) {
  const rate = 8000, n = rate * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}

/** PDF minimale con una riga di testo. */
function minimalPdf(text: string) {
  const t = text.replace(/[()\\]/g, "");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${44 + t.length} >>\nstream\nBT /F1 18 Tf 60 780 Td (${t}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

main().catch((e) => { console.error(e); process.exit(1); });
