import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  getAdditionalUserInfo,
  inMemoryPersistence,
  linkWithPopup,
  onIdTokenChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updatePassword,
  verifyBeforeUpdateEmail,
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

/** Accesso ai provider di autenticazione: email/password (staff) e Google (studenti, via invito). */
export const authService = {
  onChange(cb: (user: User | null) => void) {
    return onIdTokenChanged(firebaseAuth(), cb);
  },

  async signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
    return cred.user;
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

  /** Utente con accesso tramite password (per mostrare o nascondere cambio email/password). */
  hasPassword(user: User) {
    return user.providerData.some((p) => p.providerId === "password");
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

  sendPasswordReset(email: string) {
    return sendPasswordResetEmail(firebaseAuth(), email.trim());
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

  async reauthenticate(password: string) {
    const user = firebaseAuth().currentUser;
    if (!user?.email) throw new AppError("Sessione scaduta. Accedi di nuovo.");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  },

  /** Invia un link di verifica al nuovo indirizzo; l'email cambia solo dopo la conferma. */
  async changeEmail(newEmail: string, currentPassword: string) {
    await this.reauthenticate(currentPassword);
    await verifyBeforeUpdateEmail(firebaseAuth().currentUser!, newEmail.trim());
  },

  async changePassword(currentPassword: string, newPassword: string) {
    await this.reauthenticate(currentPassword);
    await updatePassword(firebaseAuth().currentUser!, newPassword);
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
