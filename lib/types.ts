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

// ------------------------------------------------------------ immobilier
/** Nature d'un bien mis en location. */
export type PropertyKind =
  | "appartement" | "villa" | "maison" | "bureau"
  | "local_commercial" | "immeuble" | "terrain" | "autre";
/** Un bien est occupé, libre, ou retiré de la location. */
export type PropertyStatus = "disponible" | "occupe" | "indisponible";
/** Cycle de vie d'une quittance : brouillon, émise, annulée. */
export type RentReceiptStatus = "draft" | "issued" | "cancelled";
/** Comment le loyer a été réglé. */
export type RentPaymentMethod =
  | "especes" | "cheque" | "virement" | "depot" | "mobile_money";

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

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  appartement: "Appartement",
  villa: "Villa",
  maison: "Maison",
  bureau: "Bureau",
  local_commercial: "Local commercial",
  immeuble: "Immeuble",
  terrain: "Terrain",
  autre: "Autre",
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  disponible: "Disponible",
  occupe: "Occupé",
  indisponible: "Indisponible",
};

export const PROPERTY_STATUS_TONES: Record<PropertyStatus, Tone> = {
  disponible: "success",
  occupe: "info",
  indisponible: "warning",
};

export const RENT_RECEIPT_STATUS_LABELS: Record<RentReceiptStatus, string> = {
  draft: "Brouillon",
  issued: "Émise",
  cancelled: "Annulée",
};

export const RENT_RECEIPT_STATUS_TONES: Record<RentReceiptStatus, Tone> = {
  draft: "warning",
  issued: "success",
  cancelled: "danger",
};

/** Les quatre cases du carnet, plus le mobile money. */
export const RENT_PAYMENT_METHOD_LABELS: Record<RentPaymentMethod, string> = {
  especes: "Espèces",
  cheque: "Chèque",
  virement: "Virement bancaire",
  depot: "Dépôt sur compte",
  mobile_money: "Mobile money",
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
  /** Sous-titre : ce que fait l'entreprise, sous son nom. */
  trade_name: string | null;
  /** Devise ou signature commerciale, si elle en a une. */
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

// -------------------------------------------------------- plans & billing
export type BillingInterval = "month";
export type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "expired";

export type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  billing_interval: BillingInterval;
  duration_days: number;
  document_limit: number | null;
  user_limit: number | null;
  is_unlimited_documents: boolean;
  is_unlimited_users: boolean;
  is_launch_offer: boolean;
  /** Le journal d'audit est-il consultable ? L'écriture, elle, est toujours faite. */
  has_audit_log: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  started_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  // Nul tant qu'aucune organisation n'existe : c'est le cas de la toute
  // première transaction d'une inscription, avant confirmation. Il se
  // remplit au provisionnement — voir `provision_signup_intent`.
  organization_id: string | null;
  user_id: string | null;
  subscription_id: string | null;
  plan_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  provider: string;
  payment_method: string | null;
  status: PaymentStatus;
  paid_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// --------------------------------------------- inscription et paiement
/**
 * Une intention de souscription, avant tout paiement confirmé.
 *
 * Ne porte AUCUN pouvoir d'accès : ni mot de passe, ni session, ni
 * organisation utilisable. Elle ne devient un compte réel qu'au passage
 * à `active`, provisionné par le webhook Moneroo — jamais avant.
 */
export type SignupIntentStatus =
  | "pending"
  | "paid"
  | "active"
  | "failed"
  | "cancelled"
  | "expired";

export type SignupIntent = {
  id: string;
  email: string;
  org_name: string;
  plan_id: string;
  status: SignupIntentStatus;
  user_id: string | null;
  organization_id: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Résumé d'abonnement retourné par `getActiveSubscription()`. */
export type ActiveSubscription = {
  subscription_id: string;
  plan_id: string;
  plan_slug: string;
  plan_name: string;
  price: number;
  currency: string;
  document_limit: number | null;
  user_limit: number | null;
  is_unlimited_documents: boolean;
  is_unlimited_users: boolean;
  is_launch_offer: boolean;
  has_audit_log: boolean;
  status: SubscriptionStatus;
  expires_at: string | null;
};

// ------------------------------------------------------ immobilier (rows)

/** Un bien mis en location par l'entreprise. */
export type Property = {
  id: string;
  organization_id: string;
  /** Référence interne : « APP-A3 », « VILLA-2 ». Unique chez elle seule. */
  reference: string;
  name: string;
  kind: PropertyKind;
  address: string;
  description: string;
  /** Le bailleur, quand l'entreprise gère pour le compte d'un tiers. */
  owner_name: string;
  rent_amount: number;
  charges_amount: number;
  status: PropertyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Un locataire, et les termes de son bail. */
export type Tenant = {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string;
  lease_reference: string;
  /** Nul tant qu'aucun lot n'est affecté, ou après une sortie. */
  property_id: string | null;
  /**
   * Le loyer du BAIL, qui peut différer de celui affiché sur le bien —
   * remise consentie, ancien bail non réévalué. C'est celui-ci qui
   * alimente la quittance.
   */
  rent_amount: number;
  charges_amount: number;
  lease_start: string | null;
  lease_end: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Une quittance de loyer.
 *
 * Les champs recopiés — nom du locataire, adresse du bien — le sont
 * délibérément : la pièce est remise, et opposable. Renommer le locataire
 * l'an prochain ne doit pas faire diverger la quittance de janvier de
 * l'exemplaire qu'il détient. Même raisonnement que le montant en lettres,
 * stocké et non recalculé à l'affichage.
 */
export type RentReceipt = {
  id: string;
  organization_id: string;
  number: string;
  status: RentReceiptStatus;
  issued_on: string;
  property_id: string | null;
  tenant_id: string | null;
  tenant_name: string;
  tenant_phone: string;
  property_label: string;
  property_address: string;
  property_kind: PropertyKind | null;
  landlord_name: string;
  manager_name: string;
  period_start: string;
  period_end: string;
  period_label: string;
  rent_amount: number;
  charges_amount: number;
  other_fees: number;
  total_amount: number;
  amount_in_words: string;
  payment_method: RentPaymentMethod;
  payment_reference: string;
  paid_on: string | null;
  notes: string;
  cancelled_at: string | null;
  cancel_reason: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
