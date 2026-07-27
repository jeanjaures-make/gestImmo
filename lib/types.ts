import type { Tone } from "@/components/ui/kit";

// ---------------------------------------------------------------- enums
export type UserRole = "owner" | "manager" | "accountant" | "viewer";
export type ApartmentStatus = "vacant" | "occupied" | "maintenance";
export type LeaseStatus = "draft" | "active" | "ended" | "terminated";
export type PaymentStatus = "pending" | "paid" | "partial" | "late";
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";
export type MaintenanceStatus = "open" | "in_progress" | "resolved" | "cancelled";
export type ExpenseCategory =
  | "maintenance"
  | "taxes"
  | "insurance"
  | "utilities"
  | "management"
  | "works"
  | "other";
export type DocumentOwnerType =
  | "organization"
  | "building"
  | "apartment"
  | "tenant"
  | "lease"
  | "expense";
export type NotificationKind =
  | "incident_declared"
  | "incident_updated"
  | "payment_recorded"
  | "payment_declared"
  | "payment_declaration_reviewed"
  | "lease_created";
export type PaymentDeclarationStatus = "pending" | "accepted" | "rejected";

// Les valeurs sont en anglais en base (enums PostgreSQL), l'affichage en
// français : la traduction vit ici et nulle part ailleurs.
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Propriétaire",
  manager: "Gestionnaire",
  accountant: "Comptable",
  viewer: "Lecture seule",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: "Accès total, y compris la facturation et les membres.",
  manager: "Gestion quotidienne du parc, des baux et des interventions.",
  accountant: "Lecture complète et saisie des paiements.",
  viewer: "Consultation seule.",
};

export const APARTMENT_STATUS_LABELS: Record<ApartmentStatus, string> = {
  vacant: "Libre",
  occupied: "Occupé",
  maintenance: "Travaux",
};

export const APARTMENT_STATUS_TONES: Record<ApartmentStatus, Tone> = {
  vacant: "neutral",
  occupied: "success",
  maintenance: "warning",
};

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  draft: "Brouillon",
  active: "En cours",
  ended: "Terminé",
  terminated: "Résilié",
};

export const LEASE_STATUS_TONES: Record<LeaseStatus, Tone> = {
  draft: "neutral",
  active: "success",
  ended: "neutral",
  terminated: "danger",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "À encaisser",
  paid: "Encaissé",
  partial: "Partiel",
  late: "En retard",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  pending: "info",
  paid: "success",
  partial: "warning",
  late: "danger",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  maintenance: "Entretien",
  taxes: "Taxes",
  insurance: "Assurance",
  utilities: "Fluides",
  management: "Gestion",
  works: "Travaux",
  other: "Autre",
};

export const MAINTENANCE_PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

export const MAINTENANCE_PRIORITY_TONES: Record<MaintenancePriority, Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Résolue",
  cancelled: "Annulée",
};

export const PAYMENT_DECLARATION_STATUS_LABELS: Record<
  PaymentDeclarationStatus,
  string
> = {
  pending: "En attente de validation",
  accepted: "Validée",
  rejected: "Refusée",
};

export const PAYMENT_DECLARATION_STATUS_TONES: Record<
  PaymentDeclarationStatus,
  Tone
> = {
  pending: "warning",
  accepted: "success",
  rejected: "danger",
};

/** Moyens de règlement proposés au locataire lorsqu'il déclare un paiement. */
export const PAYMENT_METHODS = [
  "Virement bancaire",
  "Chèque",
  "Espèces",
  "Mobile money",
  "Carte bancaire",
  "Autre",
] as const;

// ---------------------------------------------------------------- rows
export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  organization_id: string;
  /** Non nul ⇒ ce compte est un locataire, pas un membre du personnel. */
  tenant_id: string | null;
  firstname: string;
  lastname: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  created_at: string;
};

export type Building = {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  photo: string | null;
  estimated_value: number | null;
  created_at: string;
};

export type Apartment = {
  id: string;
  organization_id: string;
  building_id: string;
  number: string;
  floor: string | null;
  surface: number | null;
  type: string | null;
  status: ApartmentStatus;
  created_at: string;
};

export type Tenant = {
  id: string;
  organization_id: string;
  firstname: string;
  lastname: string;
  phone: string | null;
  email: string | null;
  identity_number: string | null;
  created_at: string;
};

export type Lease = {
  id: string;
  organization_id: string;
  tenant_id: string;
  apartment_id: string;
  rent: number;
  charges: number;
  deposit: number;
  status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  created_at: string;
};

export type RentPayment = {
  id: string;
  organization_id: string;
  lease_id: string;
  month: string;
  amount: number;
  amount_paid: number;
  status: PaymentStatus;
  payment_date: string | null;
  method: string | null;
  note: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  organization_id: string;
  recipient_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export type PaymentDeclaration = {
  id: string;
  organization_id: string;
  rent_payment_id: string;
  tenant_id: string;
  amount: number;
  paid_on: string;
  method: string;
  reference: string | null;
  status: PaymentDeclarationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  organization_id: string;
  building_id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  expense_date: string;
  invoice_path: string | null;
  created_at: string;
};

// ----------------------------------------------------------- formatters
const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | string | null | undefined) {
  return currency.format(Number(value ?? 0));
}

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
