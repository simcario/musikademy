/** Normalizza testo per la ricerca: minuscolo, senza accenti, solo alfanumerici. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_PREFIX = 2;
const MAX_PREFIX = 15;
const MAX_KEYWORDS = 200;

/**
 * Genera le keyword per `array-contains`: ogni parola e i suoi prefissi (2–15 caratteri),
 * così "vocal" trova "Vocalizzo". Il limite evita documenti troppo grandi.
 */
export function buildKeywords(...parts: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const word of normalize(part).split(" ")) {
      if (word.length < MIN_PREFIX) continue;
      const max = Math.min(word.length, MAX_PREFIX);
      for (let i = MIN_PREFIX; i <= max; i++) set.add(word.slice(0, i));
      if (word.length > MAX_PREFIX) set.add(word);
    }
  }
  return Array.from(set).slice(0, MAX_KEYWORDS);
}

/** Termine di ricerca normalizzato (prima parola significativa, troncata come le keyword). */
export function searchToken(query: string): string | null {
  const word = normalize(query).split(" ").find((w) => w.length >= MIN_PREFIX);
  return word ? word.slice(0, MAX_PREFIX) : null;
}
