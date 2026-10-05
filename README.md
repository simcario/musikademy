# Musikademy

> **Learn. Practice. Grow.** — Piattaforma didattica privata per scuole di musica e canto.

Gli studenti sanno sempre cosa studiare (lezioni, materiali, ascolti, esercizi, presenze,
pagamenti, comunicazioni); il docente gestisce tutto con il minor numero di operazioni.
PWA installabile, mobile-first.

- Architettura e decisioni: [ARCHITECTURE.md](ARCHITECTURE.md)
- Stato dei lavori: [TODO.md](TODO.md)
- Specifica: `../Musikademy_Prompt_Master.md` · Design: `../stitch_musikademy_app_design/`

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

## Configurazione Firebase

Vedi [Deploy → A. Configurazione iniziale](#a-configurazione-iniziale-una-volta-sola): stessi passi per ambiente locale e produzione.

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

Account demo (password `Musikademy2026!`): `admin@musikademy.test`, `elena@musikademy.test`, `luca@musikademy.test`.
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

Il codice su GitHub (`simcario/musikademy`, branch `main`) è la sorgente del deploy:
**ogni `git push` su `main` pubblica automaticamente una nuova versione.**

### A. Configurazione iniziale (una volta sola)

1. **Login della CLI** (apre il browser):
   ```powershell
   npx firebase login
   ```
2. **Servizi Firebase** — Console → progetto `musikademy-56b76`:
   - *Authentication → Metodo di accesso*: abilita **Email/password** e **Google**
   - *Firestore Database*: crea il database (produzione, regione `europe-west`)
   - *Storage*: crea il bucket
3. **Backend App Hosting** — Console → *App Hosting → Crea backend*:
   repository `simcario/musikademy`, branch `main`, cartella radice `/`, deploy automatici **attivi**.
   Annota l'**ID del backend** (lo rivedi con `npx firebase apphosting:backends:list`).
4. **Permessi dell'account di servizio** del backend — in [Cloud Shell](https://console.cloud.google.com/?project=musikademy-56b76)
   (icona `>_` in alto a destra). Servono all'Admin SDK per creare utenti, assegnare ruoli,
   scrivere su Firestore e firmare i token degli inviti:
   ```bash
   SA=firebase-app-hosting-compute@musikademy-56b76.iam.gserviceaccount.com
   gcloud projects add-iam-policy-binding musikademy-56b76 --member="serviceAccount:$SA" --role="roles/firebaseauth.admin" --condition=None
   gcloud projects add-iam-policy-binding musikademy-56b76 --member="serviceAccount:$SA" --role="roles/datastore.user" --condition=None
   gcloud iam service-accounts add-iam-policy-binding $SA --project musikademy-56b76      --member="serviceAccount:$SA" --role="roles/iam.serviceAccountTokenCreator"
   ```
5. **Rules e indici** Firestore/Storage:
   ```powershell
   npm run deploy:rules
   ```
   Gli indici impiegano qualche minuto a costruirsi (*Firestore → Indici*): finché non sono pronti
   alcune liste mostrano "configurazione del database incompleta".

   **CORS del bucket** (una tantum): serve al pulsante "Scarica" dei materiali per salvare il file
   sul dispositivo; senza, il file viene solo aperto in una nuova scheda.
   ```powershell
   gcloud storage buckets update gs://musikademy-56b76.firebasestorage.app --cors-file=storage.cors.json
   ```
6. **Dominio autorizzato** — *Authentication → Impostazioni → Domini autorizzati*: aggiungi il dominio
   del backend (es. `musikademy--musikademy-56b76.europe-west4.hosted.app`, lo vedi nella pagina App Hosting)
   ed eventuali domini personalizzati. Senza, l'accesso con Google fallisce in produzione.
7. **Primo amministratore** (chiave service account da *Impostazioni progetto → Account di servizio →
   Genera nuova chiave*, salvata **fuori** dal progetto):
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:percorsosicuroservice-account.json"
   npm run bootstrap-admin -- --email tua@email.it --name Nome --surname Cognome
   ```

### B. Pubblicare una nuova versione (ogni volta)

1. Verifica in locale:
   ```powershell
   npm run typecheck; npm run lint; npm test; npm run build:local
   ```
2. Commit e push:
   ```powershell
   git add -A
   git commit -m "Descrizione della modifica"
   git push
   ```
3. Segui il rollout in *Console → App Hosting → backend → Rollout* (5–10 minuti).
   In alternativa, dalla CLI:
   ```powershell
   npx firebase apphosting:rollouts:create <ID_BACKEND> --git-branch main --project musikademy-56b76
   ```
4. Se hai modificato `firestore.rules`, `storage.rules` o `firestore.indexes.json`, pubblicali a parte:
   ```powershell
   npm run deploy:rules
   ```

### C. Se qualcosa va storto

- **Build fallita**: *App Hosting → Rollout → log di build*. Riproduci in locale con `npm run build:local`.
- **Errori a runtime** (500 sulle API docente, inviti): *App Hosting → Log* oppure Cloud Logging.
  Un `PERMISSION_DENIED` / `iam.serviceAccounts.signBlob` indica che manca un permesso del punto A.4.
- **Tornare alla versione precedente**: *App Hosting → Rollout* → scegli un rollout precedente → *Rollback*.

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
