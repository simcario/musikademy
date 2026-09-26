# VOCALIA · Musikademy

> **Learn. Practice. Grow.** — Piattaforma didattica privata per scuole di musica e canto.

Gli studenti sanno sempre cosa studiare (lezioni, materiali, ascolti, esercizi, presenze,
pagamenti, comunicazioni); il docente gestisce tutto con il minor numero di operazioni.
PWA installabile, mobile-first.

- Architettura e decisioni: [ARCHITECTURE.md](ARCHITECTURE.md)
- Stato dei lavori: [TODO.md](TODO.md)
- Specifica: `../VOCALIA_Prompt_Master.md` · Design: `../stitch_musikademy_app_design/`

## Stack

| Livello | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI) |
| Dati client | TanStack Query · React Hook Form + Zod |
| Backend | Firebase Auth · Cloud Firestore · Firebase Storage · Admin SDK nei Route Handler |
| Hosting | Firebase App Hosting |
| Test | Vitest · @firebase/rules-unit-testing |

## Requisiti

- Node.js 20+ (testato con 24)
- Un progetto Firebase (qui: `musikademy-56b76`)
- Per emulatori e test delle rules: **Java 11+** e Firebase CLI (inclusa come dipendenza: `npx firebase`)

## Installazione

```bash
npm install
cp .env.example .env.local   # poi compila i valori (vedi sotto)
```

## Configurazione Firebase (una tantum)

1. **Authentication** → Sign-in method → abilita **Email/Password** (docenti/admin) e **Google** (studenti).
   Settings → *Authorized domains*: aggiungi il dominio di produzione (App Hosting / dominio personalizzato),
   altrimenti l'accesso con Google fallisce con `auth/unauthorized-domain`.
   (Opzionale) Templates → personalizza in italiano l'email di reset password (invito dei docenti).
2. **Firestore Database** → crea il database (modalità production, regione `europe-west`).
3. **Storage** → crea il bucket.
4. Pubblica rules e indici:
   ```bash
   npx firebase login
   npm run deploy:rules
   ```
5. **Primo amministratore** (serve una chiave service account, *Impostazioni progetto → Account di servizio → Genera nuova chiave*,
   salvata fuori dal repository):
   ```bash
   # PowerShell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\percorso\sicuro\service-account.json"
   npm run bootstrap-admin -- --email tua@email.it --name Nome --surname Cognome
   ```
   Lo script stampa un link per impostare la password. Da quel momento studenti e docenti
   si creano dall'app.

## Variabili d'ambiente

| Variabile | Dove | Descrizione |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | client | Config web del progetto (pubblica: la sicurezza è nelle rules) |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | client | `true` = usa Auth/Firestore/Storage emulator |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | client | Opzionale: attiva le notifiche push (FCM) |
| `GOOGLE_APPLICATION_CREDENTIALS` | server | Solo in locale: service account per l'Admin SDK. Su App Hosting non serve |

Nessun segreto nel repository: `.env.local` e i JSON dei service account sono in `.gitignore`.

## Avvio locale

```bash
npm run dev          # disco NTFS / macOS / Linux (Turbopack)
npm run dev:local    # disco exFAT come D:\ di questa macchina (webpack + patch readlink)
```

Apri http://localhost:3000.

### Con emulatori e dati demo

```bash
# .env.local → NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
npm run emulators    # terminale 1 (UI su http://localhost:4000)
npm run seed         # terminale 2 — rifiuta di scrivere su progetti reali
npm run dev:local    # terminale 3
```

Account demo (password `Vocalia2026!`): `admin@vocalia.test`, `elena@vocalia.test`, `luca@vocalia.test`.
Con il flag emulatori attivo anche le API admin (Admin SDK) usano automaticamente gli emulatori.

## Build e test

```bash
npm run typecheck
npm run lint
npm test             # unit test (auth, permessi, validazioni, pagamenti, presenze, file)
npm run test:rules   # Security Rules sull'emulatore (richiede Java)
npm run build        # oppure build:local su exFAT
```

## Deploy (Firebase App Hosting)

1. Carica il progetto su un repository GitHub.
2. Console Firebase → **App Hosting** → *Crea backend* → collega il repository, cartella radice `vocalia`.
3. `apphosting.yaml` contiene già le variabili pubbliche. Il service account del backend
   usa le credenziali di default per l'Admin SDK: concedigli il ruolo
   **Firebase Authentication Admin** (per creare utenti) se non già presente, e il ruolo
   **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) *su sé stesso*:
   serve a firmare i custom token degli inviti Google. Senza, l'apertura del link d'invito dà errore 500.
   ```bash
   gcloud iam service-accounts add-iam-policy-binding firebase-app-hosting-compute@musikademy-56b76.iam.gserviceaccount.com \
     --member="serviceAccount:firebase-app-hosting-compute@musikademy-56b76.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```
4. Ogni push sul branch collegato fa il deploy. Rules/indici: `npm run deploy:rules`.

## Struttura

```text
src/
├── app/            (auth) login · (student) area studente · admin/ area docente · api/admin/ route privilegiate
├── components/     ui/ (shadcn) · layout/ (shell, navigazione) · shared/ (stati, badge, form, dialog)
├── features/       auth · admin · students · lessons · materials · exercises · payments · announcements · profile · student-area
├── services/       unico livello che parla con Firestore/Storage (+ adminApi per i route handler)
├── lib/            firebase client/admin, ruoli, validazione, file, PWA
├── hooks/  types/  utils/
scripts/            bootstrap-admin · seed · patch exFAT
tests/              unit/ · rules/
```

Flusso: `componenti → hook (TanStack Query) → services → Firebase`.

## Gestione utenti

- **Nessuna registrazione pubblica.** Il docente crea lo studente (*Studenti → Nuovo studente*):
  l'app crea l'account, assegna il ruolo e genera un **link d'invito** (`/invite#…`, monouso,
  valido 7 giorni) da mandare via WhatsApp, email o copia. Lo studente lo apre e collega il proprio
  account Google; poi accede sempre con *Accedi con Google*. Un account Google non invitato viene rifiutato.
  Dalla scheda studente, **Invito Google** genera un nuovo link e invalida i precedenti.
- **Docenti/admin**: *Impostazioni → Nuovo docente* (solo admin).
- **Disattivazione** (soft delete): l'account non può più accedere, lo storico resta.
- Il **ruolo** è un custom claim (`admin` · `teacher` · `student`) impostato solo lato server.
  Per aggiungerne uno (es. `secretary`): `src/lib/auth/roles.ts` + funzione in `firestore.rules`.

## Security Rules

- `firestore.rules`: negato per default; lo studente legge solo documenti con il proprio
  `studentId`, i materiali per tutti/del suo corso/assegnati a lui, le comunicazioni pertinenti;
  può modificare solo lo **stato** dei propri esercizi e i campi anagrafici del profilo.
  Pagamenti e presenze sono in sola lettura. Note private del docente in `studentNotes` (solo staff).
- `storage.rules`: i file dei materiali sono scaricabili solo da chi può leggere il documento
  corrispondente; upload solo staff, con validazione di tipo e dimensione.
- Test: `tests/rules/firestore.rules.test.ts`.
