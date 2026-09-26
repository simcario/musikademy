import { z } from "zod";

/** Email normalizzata (trim + minuscolo) e poi validata: accetta anche email incollate con spazi. */
export const emailField = (message = "Inserisci un'email valida") =>
  z.string().trim().toLowerCase().pipe(z.email(message));
