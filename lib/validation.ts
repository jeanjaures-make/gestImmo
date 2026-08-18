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

/**
 * Un champ absent équivaut à un champ vide.
 *
 * Un formulaire HTML envoie toujours tous ses champs, fût-ce vides ; une
 * Server Action appelée autrement — script d'import, test, requête forgée
 * — peut en omettre. Sans ce garde-fou, l'absence produisait « expected
 * string, received undefined », message qui désigne un type au lieu de
 * désigner le champ fautif.
 */
const blankIfMissing = (value: unknown) => (value === undefined ? "" : value);

const optionalText = (max: number) =>
  z.preprocess(
    blankIfMissing,
    z
      .string()
      .trim()
      .max(max)
      .transform((v) => (v === "" ? null : v))
      .nullable(),
  );

/**
 * Texte facultatif rendu en chaîne vide plutôt qu'en `null`.
 *
 * Les colonnes des pièces imprimées sont `NOT NULL DEFAULT ''` : un champ
 * laissé vide correspond à une ligne de pointillés vide sur le papier, pas
 * à une valeur inconnue. La distinction `null` / `''` n'apporterait rien
 * et forcerait des `?? ""` à chaque affichage.
 */
const plainText = (max: number) =>
  z.preprocess(
    blankIfMissing,
    z.string().trim().max(max, { message: `Ce champ dépasse ${max} caractères.` }),
  );

const optionalEmail = z.preprocess(
  blankIfMissing,
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email({ message: "Adresse e-mail invalide." }).nullable()),
);

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

/**
 * Montant secondaire : vide vaut zéro.
 *
 * « Avance » et « Reste » sont des colonnes `NOT NULL DEFAULT 0`. Sur le
 * papier, une case laissée blanche se lit « rien versé », pas « montant
 * inconnu » — la traduire en zéro est fidèle, et évite un `null` qui
 * fausserait ensuite tout calcul de totaux.
 */
const defaultedMoney = z.preprocess(
  blankIfMissing,
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number(v.replace(",", "."))))
    .pipe(
      z
        .number({ message: "Montant invalide." })
        .min(0, { message: "Le montant doit être positif." }),
    ),
);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date invalide." });

/**
 * Mot de passe.
 *
 * Douze caractères plutôt que huit : c'est la longueur, bien plus que la
 * présence d'un caractère spécial, qui résiste à une attaque par force
 * brute. On exige tout de même un mélange de casse et un chiffre, pour
 * écarter les phrases entièrement en minuscules qui figurent telles quelles
 * dans les dictionnaires de fuites.
 *
 * La borne haute vient de bcrypt, qui ignore au-delà de 72 octets : mieux
 * vaut refuser que de tronquer sans le dire.
 */
export const passwordSchema = z
  .string()
  .min(12, { message: "Douze caractères au minimum." })
  .max(72, { message: "Soixante-douze caractères au maximum." })
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), {
    message: "Mélangez majuscules et minuscules.",
  })
  .refine((v) => /[0-9]/.test(v), { message: "Ajoutez au moins un chiffre." });

/** Règles affichées à la saisie, dans l'ordre où on les vérifie. */
export const PASSWORD_RULES = [
  { label: "Douze caractères", test: (v: string) => v.length >= 12 },
  {
    label: "Majuscule et minuscule",
    test: (v: string) => /[a-z]/.test(v) && /[A-Z]/.test(v),
  },
  { label: "Au moins un chiffre", test: (v: string) => /[0-9]/.test(v) },
] as const;

/** À la connexion, on ne rejoue pas les règles : le compte existe déjà. */
export const credentialsSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
  password: z.string().min(1, { message: "Saisissez votre mot de passe." }),
});

export const signupSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
  password: passwordSchema,
});

export const emailSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
});

export const passwordUpdateSchema = z
  .object({
    password: passwordSchema,
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

/**
 * Amorce d'inscription — avant tout paiement.
 *
 * Volontairement minimal, et volontairement SANS mot de passe : le compte
 * ne naît qu'à la confirmation du paiement, par un mécanisme qui n'en a
 * jamais besoin (`generateLink`). Le reste — forme juridique, coordonnées,
 * logo — se complète depuis les Réglages une fois le compte actif.
 */
export const signupIntentSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
  org_name: text(2, 120, "Le nom de l'entreprise"),
  plan: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/, { message: "Offre invalide." }),
});

/**
 * Changement de mot de passe depuis l'application.
 *
 * L'ancien mot de passe est exigé, alors que Supabase ne le réclame pas.
 * Sans lui, une session volée — un poste laissé ouvert, un cookie
 * dérobé — suffit à changer le mot de passe et à verrouiller le
 * propriétaire hors de son propre compte. La ressaisie fait de la session
 * une preuve de présence plutôt qu'un blanc-seing.
 */
export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, { message: "Saisissez votre mot de passe actuel." }),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirm"],
  })
  .refine((v) => v.password !== v.current, {
    message: "Le nouveau mot de passe doit différer de l'ancien.",
    path: ["password"],
  });

/** Nom affiché du membre. L'adresse e-mail sert d'identifiant : elle ne se
 *  change pas ici, cela déplacerait la connexion elle-même. */
export const profileSchema = z.object({
  firstname: optionalText(80),
  lastname: optionalText(80),
});

/**
 * En-tête imprimé de l'entreprise.
 *
 * Tout est facultatif sauf le nom : une entreprise qui vient de
 * s'inscrire doit pouvoir émettre son premier reçu sans avoir d'abord
 * rempli dix champs. Le logo est traité à part : c'est un fichier.
 */
export const organizationSettingsSchema = z.object({
  name: text(2, 120, "Le nom de l'organisation"),
  legal_form: optionalText(40),
  trade_name: optionalText(160),
  tagline: optionalText(160),
  // Une activité par ligne dans le champ de saisie : c'est la forme la
  // plus proche des puces telles qu'elles s'impriment.
  activities: z.preprocess(
    blankIfMissing,
    z
      .string()
      .max(1200, { message: "La liste des activités est trop longue." })
      .transform((v) =>
        v
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 12),
      ),
  ),
  address: optionalText(240),
  phone: optionalText(60),
  phone_alt: optionalText(60),
  email: optionalEmail,
  email_alt: optionalEmail,
  website: optionalText(120),
});

// --------------------------------------------------------- pièces de caisse

export const receiptSchema = z.object({
  issued_on: isoDate,
  payer: text(1, 160, "Le nom du payeur"),
  amount: money,
  amount_in_words: plainText(300),
  articles: plainText(500),
  advance: defaultedMoney,
  balance: defaultedMoney,
  issued_by: plainText(120),
});

export const cashVoucherSchema = z
  .object({
    issued_on: isoDate,
    direction: z.enum(["entree", "sortie"]).default("sortie"),
    amount: money,
    amount_in_words: plainText(300),
    counterparty: text(1, 160, "Le nom du bénéficiaire"),
    reason: plainText(300),
    advance: defaultedMoney,
    balance: defaultedMoney,
    ordered_by: plainText(120),
    settlement: z.enum(["cash", "depot"]).default("cash"),
    deposit_ref: optionalText(120),
    account: z.enum(["personal", "company"]).default("company"),
  })
  // Le formulaire garde la référence saisie quand on rebascule sur
  // « Cash » ; sans ce nettoyage, elle partirait en base et la contrainte
  // PostgreSQL rejetterait l'enregistrement avec un message opaque.
  .transform((v) => ({
    ...v,
    deposit_ref: v.settlement === "depot" ? v.deposit_ref : null,
  }));

export const deliveryNoteSchema = z.object({
  issued_on: isoDate,
  issuer: text(1, 160, "Le nom de l'émetteur"),
  service: plainText(120),
  nota: plainText(160),
});

/** Une ligne du tableau d'un bon de sortie. */
export const deliveryLineSchema = z.object({
  designation: text(1, 200, "La désignation"),
  quantity: plainText(60),
  destination: plainText(160),
  observations: plainText(200),
});

/**
 * Les lignes d'un bon de sortie, lues depuis le FormData.
 *
 * `formDataToObject` écrase les clés répétées : il ne peut pas servir
 * ici. On lit donc les quatre colonnes en parallèle, et on écarte les
 * lignes entièrement vides — le formulaire en propose toujours quelques
 * unes d'avance, et l'utilisateur n'a pas à les effacer.
 */
export function readDeliveryLines(formData: FormData) {
  const designations = formData.getAll("designation").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const destinations = formData.getAll("destination").map(String);
  const observations = formData.getAll("observations").map(String);

  const rows = designations
    .map((designation, index) => ({
      designation,
      quantity: quantities[index] ?? "",
      destination: destinations[index] ?? "",
      observations: observations[index] ?? "",
    }))
    .filter((row) => Object.values(row).some((cell) => cell.trim() !== ""));

  return z.array(deliveryLineSchema).min(1, {
    message: "Renseignez au moins un article.",
  }).safeParse(rows);
}

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
