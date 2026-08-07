import type { Tone } from "@/components/ui/kit";

// ---------------------------------------------------------------- enums
export type UserRole = "owner" | "manager" | "accountant" | "viewer";

/** Sens du mouvement d'un bon de caisse. */
export type CashDirection = "entree" | "sortie";
/** Espèces en main, ou dépôt (banque, mobile money). */
export type CashSettlement = "cash" | "depot";
/** Imputation : la personne, ou l'entreprise. */
export type CashAccount = "personal" | "company";
/** Les trois pièces émises par le produit. */
export type DocumentKind = "receipt" | "cash_voucher" | "delivery_note";

// Les valeurs sont en anglais en base (enums PostgreSQL), l'affichage en
// français : la traduction vit ici et nulle part ailleurs.
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Propriétaire",
  manager: "Gestionnaire",
  accountant: "Caissier",
  viewer: "Lecture seule",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: "Accès total, y compris l'en-tête de l'entreprise et les membres.",
  manager: "Émet et corrige toutes les pièces, peut en supprimer.",
  accountant: "Émet et corrige les pièces, sans pouvoir en supprimer.",
  viewer: "Consultation et impression seules.",
};

export const CASH_DIRECTION_LABELS: Record<CashDirection, string> = {
  entree: "Entrée",
  sortie: "Sortie",
};

export const CASH_DIRECTION_TONES: Record<CashDirection, Tone> = {
  entree: "success",
  sortie: "warning",
};

export const CASH_SETTLEMENT_LABELS: Record<CashSettlement, string> = {
  cash: "Cash",
  depot: "Dépôt",
};

export const CASH_ACCOUNT_LABELS: Record<CashAccount, string> = {
  personal: "Compte personnel",
  company: "Compte entreprise",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  receipt: "Reçu",
  cash_voucher: "Bon de caisse",
  delivery_note: "Bon de sortie",
};

// ---------------------------------------------------------------- rows

/**
 * L'organisation, et l'en-tête qu'elle imprime.
 *
 * Ces champs ne décrivent pas un compte client : ils décrivent ce qui
 * s'imprime en haut de chaque pièce. C'est la raison d'être du produit —
 * chaque entreprise émet ses propres reçus, sous sa propre identité.
 */
export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  /** « S.A.R.L. », « S.A. »… accolé au nom. */
  legal_form: string | null;
  /** Sous-titre : « Société de travaux industriels et de prestation ». */
  trade_name: string | null;
  /** Accroche : « Votre domaine, notre expertise. » */
  tagline: string | null;
  /** Domaines d'activité, un par puce. */
  activities: string[];
  address: string | null;
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  email_alt: string | null;
  website: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  organization_id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  created_at: string;
};

export type Receipt = {
  id: string;
  organization_id: string;
  number: string;
  issued_on: string;
  payer: string;
  amount: number;
  amount_in_words: string;
  articles: string;
  advance: number;
  balance: number;
  issued_by: string;
  created_by: string | null;
  created_at: string;
};

export type CashVoucher = {
  id: string;
  organization_id: string;
  number: string;
  issued_on: string;
  direction: CashDirection;
  amount: number;
  amount_in_words: string;
  counterparty: string;
  reason: string;
  advance: number;
  balance: number;
  ordered_by: string;
  settlement: CashSettlement;
  deposit_ref: string | null;
  account: CashAccount;
  created_by: string | null;
  created_at: string;
};

export type DeliveryNote = {
  id: string;
  organization_id: string;
  number: string;
  issued_on: string;
  issuer: string;
  service: string;
  nota: string;
  created_by: string | null;
  created_at: string;
};

export type DeliveryNoteLine = {
  id: string;
  organization_id: string;
  delivery_note_id: string;
  position: number;
  designation: string;
  /** Texte et non nombre : on écrit « 3 sacs », « 2 x 50 kg ». */
  quantity: string;
  destination: string;
  observations: string;
  created_at: string;
};

// ----------------------------------------------------------- formatters
// La devise est déclarée dans `lib/money.ts`. Réexportée ici pour que les
// écrans gardent un point d'entrée unique.
export { formatCurrency, CURRENCY_LABEL } from "@/lib/money";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

/**
 * Ancienneté en clair : « il y a 3 h », « hier », « le 12/03/2026 ».
 *
 * À n'appeler que côté serveur, et à transmettre déjà formaté : calculée
 * au rendu client, la même date donnerait un texte différent de celui du
 * HTML serveur (fuseau et instant distincts) et React signalerait une
 * divergence d'hydratation.
 */
export function formatRelative(value: string) {
  const then = new Date(value);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60_000);

  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  if (hours < 48) return "hier";

  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} jours`;

  return `le ${then.toLocaleDateString("fr-FR")}`;
}

export function formatMonth(value: string | null | undefined) {
  if (!value) return "—";
  const label = new Date(value).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Date éclatée en jour / mois / année.
 *
 * Les pièces imprimées portent « Date : …/…/… » : trois cases, pas une
 * date formatée. On les remplit séparément pour coller au papier que les
 * entreprises utilisaient avant.
 */
export function splitDate(value: string | null | undefined) {
  if (!value) return { day: "", month: "", year: "" };
  const [year, month, day] = value.split("-");
  return { day: day ?? "", month: month ?? "", year: year ?? "" };
}
