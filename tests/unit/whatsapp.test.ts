import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANNOUNCEMENT_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  addDays,
  announcementVars,
  markdownToWhatsApp,
  messageText,
  metaParams,
  metaTemplateName,
  normalizePhone,
  relativeLessonDay,
  reminderMessageId,
  reminderRunDue,
  renderMessage,
  renderTemplate,
  templateKindOf,
  templateParam,
  transcode,
  zonedDayStart,
  zonedParts,
} from "@/lib/whatsapp/shared";

describe("normalizePhone", () => {
  it("aggiunge il prefisso ai numeri nazionali", () => {
    expect(normalizePhone("333 123 4567")).toBe("393331234567");
    expect(normalizePhone("333-123.4567")).toBe("393331234567");
    expect(normalizePhone("06 1234567")).toBe("39061234567"); // fisso italiano: lo 0 resta
  });
  it("rispetta i numeri già internazionali", () => {
    expect(normalizePhone("+39 333 1234567")).toBe("393331234567");
    expect(normalizePhone("0039 333 1234567")).toBe("393331234567");
    expect(normalizePhone("+41 79 123 45 67")).toBe("41791234567");
  });
  it("usa il prefisso indicato e toglie lo 0 di rete fuori dall'Italia", () => {
    expect(normalizePhone("07911 123456", "44")).toBe("447911123456");
  });
  it("rifiuta valori vuoti o non validi", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("testi", () => {
  it("sostituisce i segnaposto noti e lascia gli altri", () => {
    expect(renderTemplate("Ciao {nome}, {ignoto} alle {ora}", { nome: "Elena", ora: "17:30" })).toBe(
      "Ciao Elena, {ignoto} alle 17:30",
    );
  });
  it("converte il Markdown nella formattazione WhatsApp", () => {
    expect(markdownToWhatsApp("# Titolo\n**grassetto** e *corsivo*\n- uno\n- due\n[sito](https://x.it)")).toBe(
      "*Titolo*\n*grassetto* e _corsivo_\n• uno\n• due\nsito (https://x.it)",
    );
  });
  it("prepara i valori della comunicazione per ogni studente", () => {
    const vars = announcementVars(
      { title: " Saggio ", content: "Sabato alle **18**", authorName: "Luca" },
      { name: "Elena", surname: "Rossi" },
    );
    expect(vars).toEqual({ nome: "Elena", cognome: "Rossi", titolo: "Saggio", testo: "Sabato alle *18*", autore: "Luca" });
    expect(renderMessage("Ciao {nome}: {titolo} — {autore}", vars)).toBe("Ciao Elena: Saggio — Luca");
  });
  it("usa il testo personalizzato o quello predefinito", () => {
    expect(messageText({}, "reminder")).toBe(DEFAULT_REMINDER_TEMPLATE);
    expect(messageText({ announcementTemplate: "X {titolo} y" }, "announcement")).toBe("X {titolo} y");
  });
});

describe("date nel fuso Europe/Rome", () => {
  it("mezzanotte locale con ora solare e legale", () => {
    expect(zonedDayStart("2026-01-15").toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(zonedDayStart("2026-07-15").toISOString()).toBe("2026-07-14T22:00:00.000Z");
    // Giorni del cambio d'ora
    expect(zonedDayStart("2026-03-29").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedDayStart("2026-10-25").toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });
  it("data e ora locali di un istante", () => {
    expect(zonedParts(new Date("2026-10-12T16:05:00Z"))).toEqual({ date: "2026-10-12", time: "18:05" });
    expect(zonedParts(new Date("2026-12-31T23:30:00Z"))).toEqual({ date: "2027-01-01", time: "00:30" });
  });
  it("somma giorni di calendario anche a fine mese/anno", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("descrive il giorno della lezione", () => {
    expect(relativeLessonDay("2026-10-12", "2026-10-12")).toBe("oggi");
    expect(relativeLessonDay("2026-10-13", "2026-10-12")).toBe("domani");
    expect(relativeLessonDay("2026-10-14", "2026-10-12")).toBe("mercoledì 14 ottobre");
  });
});

describe("pianificazione promemoria", () => {
  const s = { remindersEnabled: true, reminderTime: "18:00", daysBefore: 1 };
  it("parte una volta al giorno, dall'orario impostato in poi", () => {
    expect(reminderRunDue({ date: "2026-10-12", time: "17:59" }, s, null)).toBe(false);
    expect(reminderRunDue({ date: "2026-10-12", time: "18:00" }, s, null)).toBe(true);
    expect(reminderRunDue({ date: "2026-10-12", time: "21:30" }, s, "2026-10-11")).toBe(true);
    expect(reminderRunDue({ date: "2026-10-12", time: "21:30" }, s, "2026-10-12")).toBe(false);
  });
  it("non parte se disattivato", () => {
    expect(reminderRunDue({ date: "2026-10-12", time: "19:00" }, { ...s, remindersEnabled: false }, null)).toBe(false);
  });
  it("un solo promemoria per lezione e giorno", () => {
    expect(reminderMessageId("abc", "2026-10-13")).toBe("reminder_abc_2026-10-13");
  });
});

describe("trascodifica per i template Meta (Zernio)", () => {
  it("numera i segnaposto nell'ordine in cui compaiono, anche se ripetuti", () => {
    const t = transcode("Ciao {nome}, la lezione {titolo} è {quando}. Ti aspettiamo {nome} a scuola, a presto!", "reminder");
    expect(t.body).toBe("Ciao {{1}}, la lezione {{2}} è {{3}}. Ti aspettiamo {{4}} a scuola, a presto!");
    expect(t.order).toEqual(["nome", "titolo", "quando", "nome"]);
  });
  it("i testi predefiniti rispettano le regole di Meta", () => {
    expect(transcode(DEFAULT_REMINDER_TEMPLATE, "reminder").issues).toEqual([]);
    expect(transcode(DEFAULT_ANNOUNCEMENT_TEMPLATE, "announcement").issues).toEqual([]);
  });
  it("segnala il template che Meta ha rifiutato (troppe variabili)", () => {
    const v1 = 'Ciao {nome}, ti ricordiamo la lezione "{titolo}" {quando} alle {ora} con {docente}. A presto!';
    expect(transcode(v1, "reminder").issues.join(" ")).toMatch(/Troppi segnaposto/);
  });
  it("segnala inizio/fine con segnaposto, segnaposto attaccati e sconosciuti", () => {
    expect(transcode("{nome}, la tua lezione di domani è confermata dalla scuola.", "reminder").issues.join()).toMatch(/iniziare/);
    expect(transcode("La tua lezione di domani è confermata, ci vediamo {ora}.", "reminder").issues.join()).toMatch(/finire/);
    expect(transcode("Ciao, la lezione {titolo} {ora} è confermata dalla nostra scuola di musica.", "reminder").issues.join()).toMatch(
      /attaccati/,
    );
    expect(transcode("Ciao {studente}, la lezione è confermata dalla scuola.", "reminder").unknown).toEqual(["studente"]);
    // {testo} non esiste nei promemoria
    expect(transcode("Ciao, ecco {testo} dalla scuola di musica.", "reminder").unknown).toEqual(["testo"]);
  });
  it("prepara le variabili su una riga, come richiede Meta", () => {
    expect(templateParam("riga 1\n\nriga 2\tcon    spazi")).toBe("riga 1 · riga 2 con spazi");
    expect(templateParam("")).toBe("—");
    expect(templateParam("x".repeat(10), 5)).toBe("xxxx…");
    const vars = announcementVars({ title: "Saggio", content: "# Avviso\nSabato alle **18**" }, { name: "Elena" });
    expect(metaParams(DEFAULT_ANNOUNCEMENT_TEMPLATE, "announcement", vars)).toEqual([
      "Elena",
      "Saggio",
      "*Avviso* · Sabato alle *18*",
    ]);
  });
  it("nomi dei template unici e validi per Meta", () => {
    const name = metaTemplateName("reminder", new Date("2026-10-12T09:30:15Z"));
    expect(name).toBe("musikademy_promemoria_20261012093015");
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });
  it("le prove usano il template delle comunicazioni", () => {
    expect(templateKindOf("test")).toBe("announcement");
    expect(templateKindOf("reminder")).toBe("reminder");
  });
});
