import { z } from "zod";

/** Ruolo dell'organizzazione (ADR D31), validato anche lato server. */
export const roleFormSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(60),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  kind: z.enum(["member", "staff"]),
  permissions: z.array(z.string()).max(30),
});
export type RoleFormValues = z.infer<typeof roleFormSchema>;
