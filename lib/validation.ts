import { z } from "zod";

/**
 * Schémas partagés client ↔ serveur.
 *
 * Le même objet valide le formulaire dans le navigateur (React Hook Form)
 * et l'entrée de la Server Action. La validation serveur n'est jamais
 * facultative : un appel direct à l'action contourne le formulaire.
 */

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, { message: `${label} est obligatoire.` })
    .max(max, { message: `${label} est trop long (${max} caractères max).` });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

// Les <input type="number"> renvoient des chaînes ; on accepte aussi la
// virgule décimale, usuelle en français.
// Une chaîne vide devient NaN et non 0 : un champ montant laissé vide doit
// être rejeté, pas interprété comme « gratuit ».
const money = z
  .string()
  .trim()
  .transform((v) => (v === "" ? Number.NaN : Number(v.replace(",", "."))))
  .pipe(
    z
      .number({ message: "Montant invalide." })
      .min(0, { message: "Le montant doit être positif." }),
  );

const optionalMoney = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
  .pipe(
    z
      .number({ message: "Montant invalide." })
      .min(0, { message: "Le montant doit être positif." })
      .nullable(),
  );

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date invalide." });

const optionalIsoDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(isoDate.nullable());

export const credentialsSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
  password: z
    .string()
    .min(8, { message: "Le mot de passe doit faire au moins 8 caractères." })
    .max(72, { message: "Le mot de passe est trop long." }),
});

export const emailSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
});

export const passwordUpdateSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: "Le mot de passe doit faire au moins 8 caractères." })
      .max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirm"],
  });

export const organizationSchema = z.object({
  name: text(2, 120, "Le nom de l'organisation"),
  firstname: optionalText(80),
  lastname: optionalText(80),
});

export const buildingSchema = z.object({
  name: text(1, 120, "Le nom"),
  address: text(1, 200, "L'adresse"),
  city: text(1, 120, "La ville"),
  country: z.string().trim().max(80).default("France"),
  estimated_value: optionalMoney,
});

export const apartmentSchema = z.object({
  building_id: z.uuid({ message: "Immeuble invalide." }),
  number: text(1, 40, "Le numéro"),
  floor: optionalText(20),
  type: optionalText(40),
  surface: optionalMoney,
  status: z.enum(["vacant", "occupied", "maintenance"]).default("vacant"),
});

export const tenantSchema = z.object({
  firstname: text(1, 80, "Le prénom"),
  lastname: text(1, 80, "Le nom"),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email({ message: "Adresse e-mail invalide." }).nullable()),
  identity_number: optionalText(80),
});

export const leaseSchema = z
  .object({
    tenant_id: z.uuid({ message: "Locataire invalide." }),
    apartment_id: z.uuid({ message: "Logement invalide." }),
    rent: money,
    charges: optionalMoney,
    deposit: optionalMoney,
    status: z.enum(["draft", "active", "ended", "terminated"]).default("active"),
    start_date: isoDate,
    end_date: optionalIsoDate,
  })
  .refine((v) => !v.end_date || v.end_date > v.start_date, {
    message: "La date de fin doit être postérieure à la date de début.",
    path: ["end_date"],
  });

export const paymentSchema = z.object({
  lease_id: z.uuid({ message: "Bail invalide." }),
  month: isoDate,
  amount: money,
  amount_paid: optionalMoney,
  status: z.enum(["pending", "paid", "partial", "late"]).default("pending"),
  payment_date: optionalIsoDate,
  method: optionalText(60),
  note: optionalText(500),
});

export const expenseSchema = z.object({
  building_id: z.uuid({ message: "Immeuble invalide." }),
  category: z
    .enum([
      "maintenance",
      "taxes",
      "insurance",
      "utilities",
      "management",
      "works",
      "other",
    ])
    .default("other"),
  label: text(1, 160, "Le libellé"),
  amount: money,
  expense_date: isoDate,
});

export const maintenanceSchema = z.object({
  building_id: z.uuid({ message: "Immeuble invalide." }),
  apartment_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid({ message: "Logement invalide." }).nullable()),
  title: text(1, 160, "L'intitulé"),
  description: optionalText(2000),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z
    .enum(["open", "in_progress", "resolved", "cancelled"])
    .default("open"),
});

/** Convertit un FormData en objet simple avant validation Zod. */
export function formDataToObject(formData: FormData) {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Premier message d'erreur lisible, pour affichage direct dans le formulaire. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides.";
}
