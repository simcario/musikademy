/**
 * Traduce errori Firebase/rete in messaggi comprensibili.
 * Non mostrare mai all'utente il messaggio tecnico originale (§45).
 */
const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email o password non corretti.",
  "auth/invalid-email": "L'indirizzo email non è valido.",
  "auth/user-disabled": "Questo account è stato disattivato. Contatta la scuola.",
  "auth/user-not-found": "Email o password non corretti.",
  "auth/wrong-password": "Email o password non corretti.",
  "auth/too-many-requests": "Troppi tentativi. Riprova tra qualche minuto.",
  "auth/network-request-failed": "Connessione assente. Controlla la rete e riprova.",
  "auth/requires-recent-login": "Per sicurezza, esci e accedi di nuovo prima di questa operazione.",
  "auth/email-already-in-use": "Esiste già un account con questa email.",
  "auth/email-already-exists": "Esiste già un account con questa email.",
  "auth/weak-password": "La password deve contenere almeno 8 caratteri.",
  "auth/popup-closed-by-user": "Accesso con Google annullato.",
  "auth/cancelled-popup-request": "Accesso con Google annullato.",
  "auth/user-cancelled": "Accesso con Google annullato.",
  "auth/popup-blocked": "Il browser ha bloccato la finestra di Google: consenti i popup per questo sito e riprova.",
  "auth/credential-already-in-use": "Questo account Google è già collegato a un altro utente. Scegline un altro.",
  "auth/account-exists-with-different-credential":
    "Esiste già un account con questa email: accedi con email e password o usa il link d'invito.",
  "auth/unauthorized-domain": "Accesso con Google non abilitato per questo indirizzo del sito. Contatta la scuola.",
  "auth/operation-not-allowed": "Metodo di accesso non abilitato. Contatta la scuola.",
  "auth/invalid-custom-token": "Link d'invito non valido. Chiedi alla scuola di inviartene uno nuovo.",
  "permission-denied": "Non hai i permessi per questa operazione.",
  "unavailable": "Servizio momentaneamente non raggiungibile. Riprova.",
  "not-found": "Elemento non trovato.",
  "failed-precondition": "Operazione non ancora disponibile: configurazione del database incompleta.",
  "storage/unauthorized": "Non hai i permessi per accedere a questo file.",
  "storage/canceled": "Caricamento annullato.",
  "storage/quota-exceeded": "Spazio di archiviazione esaurito.",
  "storage/retry-limit-exceeded": "Caricamento interrotto: connessione instabile.",
  "storage/object-not-found": "File non trovato.",
};

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorMessage(error: unknown, fallback = "Si è verificato un errore. Riprova."): string {
  if (error instanceof AppError) return error.message;
  const code = (error as { code?: string } | null)?.code;
  if (code) {
    const key = code.replace(/^firestore\//, "");
    if (MESSAGES[key]) return MESSAGES[key];
  }
  if (process.env.NODE_ENV !== "production") console.error(error);
  return fallback;
}
