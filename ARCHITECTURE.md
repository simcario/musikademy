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
| D11 | **PWA** con `app/manifest.ts` + service worker scritto a mano (`public/sw.js`) | Nessuna dipendenza da plugin webpack (Next 16 usa Turbopack). Cache solo di asset statici: i dati personali non vengono messi in cache dal SW. La cache è versionata con il numero di build (`/sw.js?v=<build>`, generato in `next.config.ts`): a ogni rilascio le cache precedenti vengono eliminate; la pagina "Info app" confronta la build locale con `/api/build`. |
| D12 | **FCM predisposto ma opzionale** | `lib/firebase/messaging.ts` + `users/{uid}/fcmTokens/{token}`. Attivo solo se è configurata `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. |
| D13 | **Classe = corso** | La spec cita "classe" per le comunicazioni ma il modello dati ha solo `courses`: la destinazione "classe" è mappata su `course`. |
| D14 | Aggiunta categoria materiale **`immagine`** | La spec elenca "Immagini" tra le categorie UI (§10) ma non nel modello (§34). |
| D16 | **Note private in `studentNotes/{uid}`** (solo staff) invece che in `students.notes` | Lo studente legge il proprio documento `students`: le note del docente lì sarebbero esposte (§40). |
| D17 | **Nessun `downloadURL` salvato in Firestore** | Il token negli URL di Storage bypassa le Storage Rules ed è permanente. L'URL si ottiene a runtime con `getDownloadURL`, che verifica le rules. |
| D18 | **Visibilità materiali additiva**: `studentIds` rende visibile un materiale ai singoli studenti qualunque sia `visibility` | Un materiale di corso può essere assegnato anche a uno studente esterno al corso senza duplicarlo. |
| D19 | **Select native** nei form | Picker di sistema su mobile (UX touch migliore), accessibili senza JS. |
| D20 | **Studenti: accesso con Google tramite invito**. Il docente crea l'account (UID stabile, ADR D2) e un invito monouso (7 gg) in `invites/{sha256(token)}`, inaccessibile ai client. `/invite#token` → `POST /api/invites/accept` restituisce un custom token → `signInWithCustomToken` (persistenza in memoria) → `linkWithPopup(Google)` → `POST /api/invites/complete` verifica il provider e chiude l'invito | Nessuna registrazione pubblica; l'account Google si aggancia all'UID già usato da lezioni e pagamenti; il token nel frammento non finisce nei log. Un login Google non invitato crea un utente senza ruolo che il client elimina subito. Richiede `roles/iam.serviceAccountTokenCreator` sul service account di App Hosting |
| D21 | **Quote a cicli di 4 settimane e versamenti parziali**. `students.fee` = costo del corso (`cycleAmount` per ciclo, `lessonPrice`/`lessonsPerCycle` facoltativi, `startDate` = prima lezione, `dueAt` = scadenza a inizio o fine ciclo). I cicli durano 28 giorni e partono dalla prima lezione, non dal mese di calendario (`src/utils/cycles.ts`). Un documento `payments` è una **quota** (il dovuto) con `installments[]` (versamenti) e `paidAmount` denormalizzato; `status` = `pending`/`partial`/`paid`/`cancelled`, ricalcolato in transazione a ogni versamento. Le quote dei cicli hanno ID `cycle_{uid}_{YYYY-MM-DD inizio ciclo}` | Pagamenti lezione per lezione senza una collezione in più: le quote di un mese hanno pochi versamenti. `paidAmount` permette i totali con `sum()` lato server. ID deterministico → "Genera quote" è idempotente e non sovrascrive quote già pagate. I documenti precedenti senza `paidAmount` sono letti come interamente pagati se `paid` (ma non entrano nel totale "incassato" aggregato) |
| D22 | **Esercizi interattivi** = un normale `assignments` con il campo `interactive: { kind, …impostazioni }`. Il catalogo è nel codice (`features/exercises/interactive/catalog.ts`), il docente lo vede nella sezione "Esercizi interattivi" e assegna da lì. La nota suonata è riconosciuta **sul dispositivo** dal microfono (Web Audio + McLeod Pitch Method in `pitch.ts`): nessun audio viene registrato o inviato. L'ingresso scelto al primo utilizzo è salvato in `localStorage` (`musikademy.mic`) | Nessuna collezione né rules nuove: stato, scadenza e assegnazione a più studenti restano quelli degli esercizi. Un nuovo esercizio = tipo in `types` + voce di catalogo + impostazioni (`interactive-settings`) + componente di gioco; quelli a risposta singola (tastiera, pentagramma, intervalli) condividono `note-quiz-game`. Gli esercizi con `wizard: true` si assegnano con la procedura guidata (`interactive-wizard`), gli altri con il form. "Suona la battuta" valuta le note nell'ordine e il completamento entro la battuta, non la durata di ogni nota. Richiede `Permissions-Policy: microphone=(self)` e un contesto sicuro (HTTPS o `localhost`). Il punteggio della sessione non viene salvato: lo studente può scrivere solo `status` |
| D23 | **Sezione Esercizi = catalogo**: esercizi interattivi + materiali di categoria `esercizio` (il "catalogo" degli esercizi con file). Questi materiali non compaiono più nella libreria Materiali (docente e studente), né nei selettori di materiali di lezioni e studenti: lo studente li apre dall'esercizio assegnato. Gli esercizi assegnati si vedono solo nella scheda del singolo studente | Nessuna collezione nuova: il catalogo riusa upload, anteprima e visibilità additiva (D18) dei materiali. Il filtro è lato client (`EXERCISE_CATEGORY`): niente indici aggiuntivi |
| D24 | **WhatsApp tramite WhatsApp Web, in un worker separato** (`whatsapp-worker/`, whatsapp-web.js + Chrome). App e worker comunicano solo via Firestore: `whatsapp/session` (stato, QR, heartbeat — scritto dal worker), `whatsapp/control` (collega/scollega — admin), `whatsapp/settings` (orario e testo dei promemoria — admin), `whatsappMessages` (coda: lo staff crea `queued`, il worker invia e aggiorna lo stato). Il worker all'avvio controlla la sessione salvata: se manca apre WhatsApp Web e pubblica il QR nel pannello. Promemoria: una volta al giorno all'orario impostato (fuso Europe/Rome) per le lezioni `scheduled` del giorno stesso o dei giorni seguenti, con ID deterministico `reminder_{lessonId}_{data}` (mai doppi) e scadenza all'inizio della lezione. Il numero dello studente è letto all'invio (`users.phone`, poi `students.phone`) | App Hosting scala a zero e non può tenere aperta una sessione WhatsApp Web; via Firestore il worker gira ovunque (PC della scuola, VPS) senza endpoint pubblici. La sessione (equivale all'accesso al numero) resta solo sul disco del worker. WhatsApp Web non è un'API ufficiale: invii lenti e casuali (4–9 s) per ridurre il rischio di blocco del numero; sostituibile con la WhatsApp Cloud API cambiando solo il worker |
| D25 | **WhatsApp con API ufficiale tramite Zernio**, alternativa a D24 scelta in `whatsapp/settings.provider` (`whatsapp-web` | `zernio`). Con Zernio la coda `whatsappMessages` è elaborata dal server (`lib/whatsapp/dispatch.ts`): subito dopo la messa in coda (`POST /api/admin/whatsapp/dispatch`, staff) e ogni 15 minuti da Cloud Scheduler (`POST /api/cron/whatsapp`, `CRON_SECRET`), che genera anche i promemoria; il worker resta fermo. I testi di promemoria e comunicazioni sono personalizzabili con segnaposto leggibili (`MESSAGE_PLACEHOLDERS`); i messaggi in coda salvano i valori (`templateVars`) e all'invio `transcode` li mappa sulle variabili `{{n}}` del template Meta in uso (UTILITY, italiano). Ogni modifica del testo è un nuovo template in `metaDrafts`, promosso in `metaTemplates` appena Meta lo approva; i messaggi senza template approvato restano in coda. `metaTemplates`/`metaDrafts` li scrive solo il server (rules). Chiave `ZERNIO_API_KEY` solo server; numero = primo account WhatsApp attivo su Zernio o `ZERNIO_WHATSAPP_ACCOUNT_ID` | API ufficiale: nessun rischio di blocco e nessun computer acceso; costo per una piccola scuola di pochi euro al mese (tariffe Meta, Zernio gratuito sotto 10.000 messaggi). Il prezzo è il testo fisso: promemoria non personalizzabili liberamente, comunicazioni lunghe accorciate (il testo completo resta nell'app) |
| D26 | **Cartelle di materiali e gruppi di studenti**. `groups/{id}` = gruppo; l'appartenenza è in `students.groupIds` (uno studente in più gruppi, massimo 29). `materialFolders/{id}` = cartella annidabile (`parentId`), condivisa con `studentIds` e `groupIds`; un materiale sta in una cartella (`folderId`) e può essere assegnato a gruppi (`groupIds`). La condivisione si eredita verso il basso: `materialFolders.audience` = `studentIds` + `groupIds` + `audience` della cartella superiore, e il campo derivato `materials.audience` = gruppi del materiale + `audience` della sua cartella (`materialAudience` in `folderService`). Condividere, spostare o eliminare una cartella riallinea in batch tutto il suo sottoalbero (`subtreeWrites`); eliminandola, materiali e sottocartelle salgono nella superiore. Rules e query dello studente usano solo `audience` (`array-contains-any` con UID + gruppi). Lo studente che fa parte di più gruppi/corsi sceglie quello attivo dalla barra in alto (`StudentContextProvider`, scelta in `localStorage`): vede sempre i materiali personali e per tutti, più quelli del gruppo o corso attivo | Appartenenza sul documento studente → le rules verificano i gruppi con una sola `get` (anche nelle Storage Rules, che restano a due letture cross-service). `audience` denormalizzato → nessuna `get` sulla cartella nelle rules e una sola query in più per lo studente, al prezzo di un aggiornamento in batch dei materiali quando cambia la condivisione di una cartella. Eliminare un gruppo o una cartella non elimina materiali né studenti |
| D27 | **Testi dei brani e player a tutto schermo**. Un testo è un materiale Markdown di categoria `testo`, creato da "Nuovo testo" e scritto nello stesso editor visuale delle dispense. Si associa a una o più tracce audio dall'editor: ogni traccia riceve `lyricsId` e `lyrics`, una **copia** del contenuto (`materialService.linkLyrics`), riallineata a ogni salvataggio del testo e tolta se il testo viene eliminato o cambia categoria. Avviata una traccia compare il dock in basso, che si massimizza in un player a tutto schermo (`FullPlayer` in `audio-dock`) con il testo reso dallo stesso componente `Markdown` del visualizzatore. Nella libreria dello studente le tracce audio stanno in un unico elenco con divisori (`TrackList`), con l'icona del testo su quelle che ne hanno uno | Le tracce delle parti di un coro sono assegnate a gruppi diversi ma condividono il testo: copiandolo sulla traccia, chi può ascoltarla lo legge senza altre regole né assegnazioni, e il player non fa letture in più. Il prezzo è la copia da riallineare (una scrittura per traccia associata) e le immagini inserite nel testo, che nel player non si vedono se il testo non è assegnato allo studente |
| D28 | **Sezione Organizzazione** (ex Studenti). `/admin/organization` ha due schede: **Corsi** (ogni corso con i suoi gruppi e i suoi studenti; i corsi non sono più in Impostazioni) e **Utenti** (gli studenti, trasversali ai corsi: `students.courseIds` può contenerne più di uno). Il gruppo appartiene a un corso con `groups.courseId` (facoltativo: i gruppi precedenti compaiono sotto "Senza corso"); togliere uno studente da un corso lo toglie anche dai gruppi di quel corso. Corsi e utenti sono elenchi: il dettaglio si apre in un pannello laterale a destra (`features/organization/panel.tsx`), il cui stato è nell'URL come pila di livelli `?p=course:ID:scheda,user:ID` (corso → gruppo o studente nello stesso pannello, "indietro" e X); `/admin/organization/users/{id}` reindirizza al pannello. Il pannello utente ha la scheda "Corsi": per ogni corso frequentato gruppi, lezioni e presenze, ricavate dalle lezioni con quel `courseId`. |
| D29 | **Playlist**. `playlists/{id}` = elenco ordinato di brani (`tracks[]`: titolo, autore, note, `materialIds`), così ogni titolo ha più materiali (ascolto, base, spartito, testo, video…). È condivisa con `studentIds`/`groupIds` (`audience` derivata, come le cartelle) e lo studente la vede in "Playlist" nel gruppo/corso attivo. I materiali dei brani diventano leggibili a chi riceve la playlist tramite il campo derivato `materials.playlistAudience` (unione delle `audience` delle playlist che li contengono), che `materialAudience` somma a gruppi e cartella. `playlists.materialIds` (derivato) permette di trovare le playlist di un materiale. Salvare brani, condividere o eliminare una playlist riallinea in un batch la playlist e i materiali che conteneva prima e dopo (`playlistService.apply`); eliminando un materiale lo si toglie dai brani | Nessuna `get` in più nelle rules (Firestore e Storage usano già `audience`) e nessuna assegnazione duplicata sui materiali: togliere un brano o la condivisione toglie anche l'accesso, salvo che il materiale sia visibile per altre vie. Il prezzo è il ricalcolo dei materiali coinvolti a ogni salvataggio (letture `in` a blocchi di 30). Le playlist non hanno "tutti gli studenti": si condividono con i gruppi |
| D30 | **Link online come materiali**. Un materiale può essere un link (`externalUrl`) invece di un file: `type: "video"`, `storagePath`/`fileName` vuoti, `size` 0, categoria libera (Video, ma anche Ascolto/Base: compare così in Ascolti). `lib/video.ts` riconosce YouTube (player `youtube-nocookie`, anche con il punto di partenza `t=`), Vimeo (anche non in elenco) e i file video diretti; gli altri link si aprono in una nuova scheda. Il player è un iframe nel visualizzatore a schermo intero; i link non si scaricano. Le rules accettano solo `https?://` | Nessun upload né spazio su Storage per i video già pubblicati. Il contenuto resta sul servizio d'origine: se il video viene rimosso o reso privato, il link smette di funzionare. Un link di YouTube non entra nel player audio (niente testo a tutto schermo né riproduzione in sottofondo) |
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
- `materials`: `fileName`, `contentType`, `size`, `category` include `immagine`; `folderId`, `groupIds`, `audience` (ADR D26)
- `materialFolders/{id}`, `groups/{id}`, `students.groupIds`: cartelle e gruppi (ADR D26)
- `playlists/{id}`, `materials.playlistAudience`: playlist di brani (ADR D29); `materials.externalUrl`: link online (ADR D30)
- `assignments`: `studentName`, `lessonTitle?` denormalizzati; `interactive?` per gli esercizi interattivi (ADR D22)
- `payments`: `studentName`, `description` (es. "Quota ottobre"), `paidAmount`, `installments[]`, `period` (inizio del ciclo, `YYYY-MM-DD`)
- `students.fee`: costo del corso (ADR D21)
- `announcements`: `authorName`, `attachments?: {name,url,storagePath}[]`
- `users/{uid}/fcmTokens/{token}`: infrastruttura notifiche
- `notifications/{id}`: predisposta (V2)
- `whatsapp/{session|control|settings|reminders}`, `whatsappMessages/{id}`: messaggistica WhatsApp (ADR D24)

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
