import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAdditionalUserInfo,
  inMemoryPersistence,
  linkWithPopup,
  onIdTokenChanged,
  setPersistence,
  signInWithCustomToken,
  signInWithPopup,
  signOut as fbSignOut,
  unlink,
  type User,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { isRole, type Access } from "@/lib/auth/roles";
import type { Role } from "@/types";
import { AppError } from "@/utils/errors";

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/** Accesso solo con Google (ADR D33): ogni account collega il proprio Google tramite invito. */
export const authService = {
  onChange(cb: (user: User | null) => void) {
    return onIdTokenChanged(firebaseAuth(), cb);
  },

  /**
   * Accesso con Google. Funziona solo per account Google già collegati tramite invito:
   * un account Google sconosciuto viene creato da Firebase senza ruolo, quindi lo eliminiamo subito.
   */
  async signInWithGoogle() {
    const cred = await signInWithPopup(firebaseAuth(), googleProvider());
    const role = await this.roleOf(cred.user, true);
    if (role) return { user: cred.user, role };
    if (getAdditionalUserInfo(cred)?.isNewUser) await cred.user.delete().catch(() => undefined);
    await this.signOut();
    throw new AppError(
      "Questo account Google non è collegato a Musikademy. Apri il link d'invito ricevuto dalla scuola, oppure usa l'account Google con cui hai accettato l'invito.",
    );
  },

  /** Utente corrente dopo il ripristino della sessione salvata. */
  async currentUser() {
    const auth = firebaseAuth();
    await auth.authStateReady();
    return auth.currentUser;
  },

  /** Email dell'account Google collegato; `null` se non è ancora collegato (account precedenti con password). */
  googleEmail(user: User): string | null {
    const google = user.providerData.find((p) => p.providerId === "google.com");
    return google ? (google.email ?? user.email ?? "") : null;
  },

  /**
   * Collega Google all'account della sessione e toglie la password (account precedenti).
   * Va chiamato direttamente dal click, altrimenti Safari blocca il popup.
   */
  async linkGoogle() {
    const user = firebaseAuth().currentUser;
    if (!user) throw new AppError("Sessione scaduta. Accedi di nuovo.");
    await linkWithPopup(user, googleProvider());
    if (user.providerData.some((p) => p.providerId === "password")) await unlink(user, "password");
    await user.reload();
  },

  /**
   * Invito, passo 1: accede all'account pre-creato con il custom token del server.
   * Sessione solo in memoria finché Google non è collegato: chiudendo la pagina a metà non resta nulla.
   */
  async openInvite(token: string): Promise<{ name: string }> {
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => ({}))) as { customToken?: string; name?: string; error?: string };
    if (!res.ok || !data.customToken) throw new AppError(data.error || "Link d'invito non valido.");
    const auth = firebaseAuth();
    await setPersistence(auth, inMemoryPersistence);
    try {
      await signInWithCustomToken(auth, data.customToken);
    } catch (e) {
      await setPersistence(auth, browserLocalPersistence);
      throw e;
    }
    return { name: data.name ?? "" };
  },

  /**
   * Invito, passo 2: collega Google all'account (va chiamato direttamente dal click,
   * senza await prima, altrimenti Safari blocca il popup) e chiude l'invito sul server.
   */
  async completeInvite(token: string): Promise<Role> {
    const auth = firebaseAuth();
    const user = auth.currentUser;
    if (!user) throw new AppError("Sessione scaduta. Riapri il link d'invito.");
    try {
      await linkWithPopup(user, googleProvider());
    } catch (e) {
      // Già collegato (es. secondo tentativo dopo un errore di rete): si prosegue.
      if ((e as { code?: string }).code !== "auth/provider-already-linked") throw e;
    }
    const res = await fetch("/api/invites/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new AppError(data.error || "Invito non completato. Riprova.");
    await setPersistence(auth, browserLocalPersistence); // da qui la sessione resta attiva come un normale accesso
    const role = await this.roleOf(user, true);
    if (!role) throw new AppError("Account non ancora abilitato. Contatta la scuola.");
    return role;
  },

  async signOut() {
    const auth = firebaseAuth();
    await fbSignOut(auth);
    // Un invito interrotto lascia la persistenza in memoria: il prossimo accesso deve restare salvato.
    await setPersistence(auth, browserLocalPersistence);
  },

  /** Il ruolo proviene dal custom claim (ADR D1): non falsificabile dal client. */
  async roleOf(user: User, forceRefresh = false): Promise<Role | null> {
    return (await this.accessOf(user, forceRefresh))?.role ?? null;
  },

  /**
   * Ruolo tecnico, ruolo dell'organizzazione e permessi (ADR D31), dai custom claim.
   * `forceRefresh` rilegge il token dal server: serve a vedere subito un ruolo cambiato dall'admin.
   * Senza rete si ripiega sul token salvato.
   */
  async accessOf(user: User, forceRefresh = false): Promise<Access | null> {
    const token = await user.getIdTokenResult(forceRefresh).catch((e) => {
      if (!forceRefresh) throw e;
      return user.getIdTokenResult();
    });
    const { role, roleId, perms } = token.claims;
    if (!isRole(role)) return null;
    return {
      role,
      roleId: typeof roleId === "string" ? roleId : role,
      perms: Array.isArray(perms) ? perms.filter((x): x is string => typeof x === "string") : null,
    };
  },

  async idToken(): Promise<string> {
    const user = firebaseAuth().currentUser;
    if (!user) throw new AppError("Sessione scaduta. Accedi di nuovo.");
    return user.getIdToken();
  },
};

/** Chiamata autenticata ai route handler privilegiati /api/admin/*. */
export async function adminApi<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const token = await authService.idToken();
  const res = await fetch(`/api/admin/${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new AppError(data.error || "Operazione non riuscita. Riprova.");
  return data;
}
