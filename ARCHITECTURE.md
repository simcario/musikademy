# Musikademy — Architettura tecnica

> Musikademy — *Learn. Practice. Grow.*
> Documento di riferimento tecnico. La specifica funzionale è `../Musikademy_Prompt_Master.md`,
> il design di riferimento è `../stitch_musikademy_app_design/`.

## 1. Panoramica

```text
Browser / PWA (Next.js App Router, React 19, Tailwind 4, shadcn/ui base-nova)
   │
   │  Firebase Web SDK  ──►  Firebase Auth (email/password staff · Google studenti)
   │                    ──►  Cloud Firestore   (protetto da firestore.rules)
   │                    ──►  Firebase Storage  (protetto da storage.rules)
   │
   └─ fetch + ID token ──►  Next.js Route Handlers /api/admin/*  (firebase-admin)
                              └─ solo operazioni privilegiate:
                                 creazione account, ruoli (custom claims),
                                 disattivazione, reset password
```

- **Letture e scritture ordinarie** avvengono dal client con il Web SDK. La **sicurezza
  reale** è nelle Security Rules: il frontend nasconde ciò che l'utente non può fare, le
  rules impediscono che lo faccia.
- **Operazioni privilegiate** (creare un utente Auth, assegnare un ruolo) richiedono
  l'Admin SDK e girano solo lato server nei Route Handler, che verificano l'ID token e il
  ruolo del chiamante.

## 2. Decisioni architetturali (ADR sintetici)

| # | Decisione | Motivazione |
|---|-----------|-------------|
| D1 | **Ruolo nei custom claims** (`token.role`), duplicato in `users/{uid}.role` | Le rules leggono il claim senza `get()` aggiuntivi (costo/latenza); il claim non è modificabile dal client. Il campo nel documento serve per UI e query. |
| D2 | **ID documento = UID Auth** per `users`, `students`, `teachers` | Le rules diventano banali (`studentId == request.auth.uid`), nessuna mappa da mantenere. `lessons.studentId`, `payments.studentId`, ecc. contengono l'UID. |
| D3 | **Account creati solo dal docente/admin** (niente registrazione pubblica) | Piattaforma privata. `POST /api/admin/users` crea l'utente Auth, imposta il claim, crea `users` + `students`, genera il link di impostazione password. |
| D4 | **Presenza = `attendance/{lessonId}`** | Le lezioni sono individuali (un `studentId` per lezione): un documento per lezione rende l'inserimento idempotente (upsert) e rapido. |
| D5 | **Esercizio a più studenti = un documento `assignments` per studente** (batch) | Rispetta il modello dati (stato per-studente), rules semplici. |
| D6 | **Stato "overdue" dei pagamenti derivato** a runtime (`pending`/`partial` + scadenza passata), persistibile dal docente | Evita job schedulati nella V1; nessun dato incoerente. |
| D7 | **Ricerca**: campo `keywords: string[]` (token normalizzati + prefissi) con `array-contains` | Compatibile con Firestore, indicizzato, nessun servizio esterno. Sostituibile con Algolia/Typesense senza toccare la UI (`searchService`). |
| D8 | **Data layer**: `components → hooks (TanStack Query) → services → Firestore` | Separazione UI/logica (§47), cache, stati loading/error/success uniformi, invalidazione dopo mutazioni. |
| D9 | **Paginazione a cursore** (`limit` + `startAfter`) nelle liste lunghe | §49: mai caricare tutti i materiali. |
| D10 | **Protezione route frontend** con guard client nei layout di gruppo (`RoleGate`) | Le rules sono la vera barriera; il guard evita di mostrare UI non pertinenti. Nessun session cookie nella V1 (possibile evoluzione: `proxy.ts` + session cookie). |
| D11 | **PWA** con `app/manifest.ts` + service worker scritto a mano (`public/sw.js`) | Nessuna dipendenza da plugin webpack (Next 16 usa Turbopack). Cache solo di asset statici: i dati personali non vengono messi in cache dal SW. |
| D12 | **FCM predisposto ma opzionale** | `lib/firebase/messaging.ts` + `users/{uid}/fcmTokens/{token}`. Attivo solo se è configurata `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. |
| D13 | **Classe = corso** | La spec cita "classe" per le comunicazioni ma il modello dati ha solo `courses`: la destinazione "classe" è mappata su `course`. |
| D14 | Aggiunta categoria materiale **`immagine`** | La spec elenca "Immagini" tra le categorie UI (§10) ma non nel modello (§34). |
| D16 | **Note private in `studentNotes/{uid}`** (solo staff) invece che in `students.notes` | Lo studente legge il proprio documento `students`: le note del docente lì sarebbero esposte (§40). |
| D17 | **Nessun `downloadURL` salvato in Firestore** | Il token negli URL di Storage bypassa le Storage Rules ed è permanente. L'URL si ottiene a runtime con `getDownloadURL`, che verifica le rules. |
| D18 | **Visibilità materiali additiva**: `studentIds` rende visibile un materiale ai singoli studenti qualunque sia `visibility` | Un materiale di corso può essere assegnato anche a uno studente esterno al corso senza duplicarlo. |
| D19 | **Select native** nei form | Picker di sistema su mobile (UX touch migliore), accessibili senza JS. |
| D20 | **Studenti: accesso con Google tramite invito**. Il docente crea l'account (UID stabile, ADR D2) e un invito monouso (7 gg) in `invites/{sha256(token)}`, inaccessibile ai client. `/invite#token` → `POST /api/invites/accept` restituisce un custom token → `signInWithCustomToken` (persistenza in memoria) → `linkWithPopup(Google)` → `POST /api/invites/complete` verifica il provider e chiude l'invito | Nessuna registrazione pubblica; l'account Google si aggancia all'UID già usato da lezioni e pagamenti; il token nel frammento non finisce nei log. Un login Google non invitato crea un utente senza ruolo che il client elimina subito. Richiede `roles/iam.serviceAccountTokenCreator` sul service account di App Hosting |
| D21 | **Quote a cicli di 4 settimane e versamenti parziali**. `students.fee` = costo del corso (`cycleAmount` per ciclo, `lessonPrice`/`lessonsPerCycle` facoltativi, `startDate` = prima lezione, `dueAt` = scadenza a inizio o fine ciclo). I cicli durano 28 giorni e partono dalla prima lezione, non dal mese di calendario (`src/utils/cycles.ts`). Un documento `payments` è una **quota** (il dovuto) con `installments[]` (versamenti) e `paidAmount` denormalizzato; `status` = `pending`/`partial`/`paid`/`cancelled`, ricalcolato in transazione a ogni versamento. Le quote dei cicli hanno ID `cycle_{uid}_{YYYY-MM-DD inizio ciclo}` | Pagamenti lezione per lezione senza una collezione in più: le quote di un mese hanno pochi versamenti. `paidAmount` permette i totali con `sum()` lato server. ID deterministico → "Genera quote" è idempotente e non sovrascrive quote già pagate. I documenti precedenti senza `paidAmount` sono letti come interamente pagati se `paid` (ma non entrano nel totale "incassato" aggregato) |
| D15 | Estensibilità ruoli | `ROLE_PERMISSIONS` in `src/lib/auth/roles.ts` mappa ruolo → capacità; aggiungere `superadmin/assistant/secretary` = nuova riga + funzione nelle rules. |

## 3. Ruoli e permessi

| Capacità | student | teacher | admin |
|---|:-:|:-:|:-:|
| Leggere i propri dati (lezioni, presenze, esercizi, pagamenti) | ✓ | – | – |
| Aggiornare lo **stato** dei propri esercizi | ✓ | ✓ | ✓ |
| Modificare il proprio profilo (nome, cognome, telefono, foto) | ✓ | ✓ | ✓ |
| Gestire studenti, lezioni, presenze, materiali, esercizi, comunicazioni | – | ✓ | ✓ |
| Gestire pagamenti | – | ✓ | ✓ |
| Gestire ruoli, docenti, corsi, impostazioni | – | – | ✓ |

## 4. Modello dati Firestore

Collezioni come da spec §29–38, con queste aggiunte (motivate sopra):

- tutti i documenti ricercabili: `keywords: string[]`
- `lessons`: `studentName` denormalizzato (liste docente senza N letture)
- `materials`: `fileName`, `contentType`, `size`, `category` include `immagine`
- `assignments`: `studentName`, `lessonTitle?` denormalizzati
- `payments`: `studentName`, `description` (es. "Quota ottobre"), `paidAmount`, `installments[]`, `period` (inizio del ciclo, `YYYY-MM-DD`)
- `students.fee`: costo del corso (ADR D21)
- `announcements`: `authorName`, `attachments?: {name,url,storagePath}[]`
- `users/{uid}/fcmTokens/{token}`: infrastruttura notifiche
- `notifications/{id}`: predisposta (V2)

Indici compositi: `firestore.indexes.json`.

## 5. Storage

```text
materials/{materialId}/{fileName}        lettura: chi può leggere il material doc
announcements/{announcementId}/{file}    lettura: autenticati; scrittura: staff
users/{uid}/avatar/{file}                lettura: autenticati; scrittura: owner (immagini ≤ 5MB)
```

Validazioni lato client (Zod) **e** lato rules (contentType + size):
PDF ≤ 50 MB · audio (mp3/wav/m4a) ≤ 100 MB · video (mp4/mov) ≤ 500 MB · immagini ≤ 20 MB.

Flusso upload (§25): `uploadBytesResumable` → progress non bloccante (coda in basso a destra)
→ creazione doc Firestore → toast di conferma. Se il doc fallisce, il file viene rimosso.

## 6. Struttura progetto

```text
src/
├── app/
│   ├── (auth)/            login, password dimenticata
│   ├── (student)/         dashboard, lessons, materials, listening, exercises,
│   │                      attendance, payments, announcements, profile
│   ├── admin/             area docente (layout separato)
│   ├── api/admin/         route handler privilegiati (firebase-admin)
│   └── manifest.ts
├── components/
│   ├── ui/                shadcn/ui
│   ├── layout/            shell studente/docente, nav, header
│   └── shared/            empty/loading/error state, badge di stato, page header
├── features/<dominio>/    componenti + hook + schemi Zod per dominio
├── lib/                   firebase client/admin, auth, query client
├── hooks/                 hook trasversali
├── services/              accesso Firestore/Storage (unico punto che importa il SDK)
├── types/                 modello dati tipizzato
└── utils/                 date, formattazione, keywords, errori
```

## 7. Gestione errori

`utils/errors.ts` traduce i codici Firebase (`auth/*`, `permission-denied`, `storage/*`)
in messaggi in italiano. Nessun errore tecnico viene mostrato all'utente (§45).
Ogni lista/pagina ha stati Loading (skeleton), Empty, Error (con "Riprova").

## 8. Ambienti

- `.env.local` (non versionato): config web + opzionali emulatori.
- `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` collega Auth/Firestore/Storage agli emulatori.
- Seed (`npm run seed`) **rifiuta** di girare senza emulatori, salvo `SEED_ALLOW_REMOTE=yes`
  esplicito, e marca i documenti con `demo: true`.

## 9. Test

- **Unit (Vitest)**: schemi Zod, permessi per ruolo, utilità (keywords, date, pagamenti).
- **Security Rules** (`@firebase/rules-unit-testing` + emulatore): isolamento studenti,
  pagamenti in sola lettura, presenze non modificabili, stato esercizio unico campo
  scrivibile dallo studente. Richiede **Java 11+** per l'emulatore.

## 10. Sviluppo su disco exFAT

Il progetto si trova su `D:\` (exFAT): niente symlink/junction e `readlink()` restituisce `EISDIR`.
In locale si usano quindi `npm run dev:local` / `build:local` (webpack + `scripts/exfat-fs-patch.cjs`).
Su NTFS, Linux e Firebase App Hosting valgono gli script standard (`dev`, `build`, Turbopack).

## 11. Evoluzioni previste (non V1)

Session cookie + `proxy.ts`,
Stripe (campo `method` e `provider` pronti), calendario, push, playlist/A-B repeat
(player già strutturato con `usePlayerControls` estendibile), motore di ricerca esterno.
