# Musikademy — TODO

Legenda: ✅ fatto e verificato · 🟡 fatto, da verificare su Firebase reale/emulatore · ⬜ da fare

## Fasi (§57)

- ✅ STEP 1 — ARCHITECTURE.md
- ✅ STEP 2 — Next.js 16, TypeScript, Tailwind 4, shadcn/ui, Firebase SDK
- 🟡 STEP 3 — Authentication (login, password dimenticata, logout, cambio email/password)
- ✅ Accesso studenti con Google tramite invito (ADR D20) — E2E su emulatori ✅ (invito, collegamento, login, rifiuto account estraneo, monouso)
- ✅ STEP 4 — Layout e navigazione (bottom nav mobile + "Altro", sidebar desktop, ricerca Ctrl+K)
- 🟡 STEP 5 — Area studente: dashboard, lezioni + dettaglio, materiali, ascolti, esercizi, presenze, pagamenti, comunicazioni, profilo
- 🟡 STEP 6 — Area docente: dashboard, studenti + scheda (7 sezioni), lezioni, registro presenze, materiali, esercizi, comunicazioni, pagamenti, impostazioni
- 🟡 STEP 7 — Firestore: services, paginazione a cursore, aggregazioni, indici (`firestore.indexes.json`)
- 🟡 STEP 8 — Storage: upload con coda/progress/annullamento, visualizzatore PDF/video/immagini, player audio
- ✅ STEP 9 — Security Rules Firestore + Storage (20/20 test Firestore sull'emulatore)
- ✅ STEP 10 — PWA: manifest, icone, service worker, pagina offline
- ✅ STEP 11 — Test: 22 unit test ✅ · 20 test Security Rules ✅
- ✅ STEP 12 — README e documentazione

Verifiche eseguite: `tsc` ✅ · `eslint` ✅ · `vitest` 26/26 ✅ · rules 22/22 ✅ · `next build` ✅ (28 route) ·
smoke test server (pagine 200, 404, manifest, SW, API admin → 401 senza token) ✅.

## Prossime azioni (richiedono il proprietario del progetto)

- ⬜ Abilitare Email/Password in Firebase Auth (Google ✅ già attivo), creare Firestore (europe-west) e Storage
- ⬜ Auth → Authorized domains: aggiungere il dominio di produzione (per il login Google)
- ⬜ Dare `roles/iam.serviceAccountTokenCreator` al service account di App Hosting (custom token inviti, vedi README)
- ⬜ `npm run deploy:rules` (rules + indici)
- ⬜ IAM: ruolo "Firebase Rules Firestore Service Agent" all'agente di Storage (`service-<numero progetto>@gcp-sa-firebasestorage.iam.gserviceaccount.com`), altrimenti gli studenti non scaricano i materiali (le Storage Rules leggono Firestore). Il deploy delle rules lo propone: rispondere sì
- ⬜ `npm run bootstrap-admin` con service account → primo accesso admin
- 🟡 Collaudo con emulatori + seed: login studente/docente e tutte le pagine ✅ · da provare a mano upload, registro presenze, pagamenti, creazione studente
- ⬜ Personalizzare in italiano il template email "Reimposta password" (invito dei docenti)
- ⬜ Collegare il repository a Firebase App Hosting

## Miglioramenti V1 (non bloccanti)

- 🟡 Materiali caricati senza visibilità ("Solo studenti assegnati" senza studenti = "Non assegnato"), assegnati o nascosti poi dalla scheda studente — tsc/eslint/vitest ✅, da provare a mano; nessuna modifica alle rules
- ⬜ Allegati alle comunicazioni (modello e Storage rules già pronti, manca l'upload in UI)
- ✅ Pagamenti: costo del corso per studente a cicli di 4 settimane dalla prima lezione, "Genera quote", versamenti parziali (ADR D21) — rules + unit test verdi; `deploy:rules` necessario (nuove regole su `students.fee` e `payments`)
- ⬜ Generazione automatica delle quote dei cicli (oggi manuale con un clic; automatica = Cloud Function schedulata)
- ⬜ Cicli: valutare se saltare le settimane di chiusura (festività) o le lezioni annullate — oggi il ciclo è sempre di 28 giorni
- ⬜ Test E2E (Playwright) dei flussi principali
- ⬜ Session cookie + `proxy.ts` per redirect lato server (oggi guard client + rules)

- 🟡 WhatsApp (ADR D24): worker con WhatsApp Web, pagina admin "WhatsApp" (collegamento con QR, orario promemoria, registro invii), invio delle comunicazioni — unit + rules ✅, worker provato sull'emulatore (QR, scadenza QR, comando Collega, promemoria in coda) · da provare con un numero reale · `deploy:rules` necessario
- 🟡 WhatsApp con API ufficiale (Zernio, ADR D25): dispatcher server + cron, template, selettore del servizio — unit/rules ✅, dispatcher provato su emulatore contro l'API Zernio reale (account trovato, invio rifiutato per template non ancora creati) · da fare: creare i template, segreti App Hosting, job Cloud Scheduler, prova reale
- ⬜ WhatsApp: decidere dove far girare il worker in produzione (PC della scuola sempre acceso o VPS)

- 🟡 Brani e playlist (ADR D29): sezioni Brani e Playlist (docente) e Playlist (studente); materiali del brano per tutti o per gruppo — unit + rules ✅ · da provare a mano · `deploy:rules` necessario (collezioni `songs`, `playlists`, campi `playlistAudience`/`externalUrl`)
- 🟡 Ruoli configurabili (ADR D31): scheda Organizzazione → Ruoli, ruolo alla creazione di utenti e staff, permessi nei claim e nelle rules — unit + rules 45/45 ✅ · da provare a mano con Auth reale (claim) · `deploy:rules` necessario (nuove regole `can()` e collezione `roles`)
- 🟡 Link YouTube/Vimeo come materiali (ADR D30), anche come Ascolto/Base — unit ✅ · da provare a mano
- 🟡 Caricamento materiale: categoria proposta = scheda aperta; con "Tutti" va scelta (obbligatoria)
- ⬜ Playlist: "Riproduci tutto" in sequenza (il player audio non ha ancora la coda)

## V2+ (roadmap §55 — non implementare ora)

Calendario · push attive (Cloud Functions) · promemoria · statistiche avanzate · playlist e A/B repeat ·
gestione recuperi · pagamenti online (Stripe) · più sedi · AI assistant.
