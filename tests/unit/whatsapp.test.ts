import { describe, expect, it } from "vitest";
import {
  addDays,
  announcementMessage,
  announcementParams,
  fillTemplate,
  reminderParams,
  templateForKind,
  templateParam,
  markdownToWhatsApp,
  normalizePhone,
  relativeLessonDay,
  reminderMessageId,
  reminderRunDue,
  renderTemplate,
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
  it("compone la comunicazione con titolo e firma", () => {
    expect(announcementMessage({ title: "Saggio", content: "Sabato alle **18**", authorName: "Luca" })).toBe(
      "*Saggio*\n\nSabato alle *18*\n\n— Luca",
    );
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

describe("template WhatsApp Cloud (Zernio)", () => {
  it("mette le variabili su una riga, come richiede Meta", () => {
    expect(templateParam("riga 1\n\nriga 2\tcon    spazi")).toBe("riga 1 · riga 2 con spazi");
    expect(templateParam("")).toBe("—");
    expect(templateParam("x".repeat(10), 5)).toBe("xxxx…");
  });
  it("prepara titolo e testo della comunicazione", () => {
    expect(announcementParams({ title: "Saggio", content: "# Avviso\nSabato alle **18**" })).toEqual([
      "Saggio",
      "*Avviso* · Sabato alle *18*",
    ]);
  });
  it("compone il promemoria nell'ordine del template", () => {
    const params = reminderParams({ nome: "Elena", titolo: "Tecnica", quando: "domani", ora: "17:30", docente: "" });
    expect(params).toEqual(["Elena", "Tecnica", "domani", "17:30", "il tuo docente"]);
    expect(fillTemplate("reminder", params)).toBe(
      'Ciao Elena, ti ricordiamo la lezione "Tecnica" domani alle 17:30 con il tuo docente. A presto!',
    );
  });
  it("le prove usano il template delle comunicazioni", () => {
    expect(templateForKind("test")).toBe("announcement");
    expect(templateForKind("reminder")).toBe("reminder");
  });
});
