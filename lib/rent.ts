import type { LeaseStatus, PaymentStatus } from "@/lib/types";

/**
 * Règles de lecture d'un bail et de ses échéances.
 *
 * Séparées de `lib/portal.ts`, qui interroge Supabase : ces fonctions ne
 * touchent à rien, elles décident. C'est ce qui les rend vérifiables sans
 * base ni navigateur — et ce sont elles qui disent au locataire combien il
 * doit, ce qui mérite d'être prouvé plutôt que constaté à l'usage.
 */

export type RentSchedule = {
  month: string;
  amount: number;
  amount_paid: number;
  status: PaymentStatus;
};

export type LeaseLike = { status: LeaseStatus };

/**
 * Le bail en cours, ou à défaut le plus récent.
 *
 * L'appelant fournit la liste déjà triée du plus récent au plus ancien.
 */
export function activeLease<T extends LeaseLike>(leases: T[]): T | null {
  return leases.find((l) => l.status === "active") ?? leases[0] ?? null;
}

/**
 * Une échéance non soldée dont le mois est révolu est en retard.
 *
 * Le retard est déduit à la lecture plutôt que stocké : un statut « en
 * retard » écrit en base devrait être rafraîchi par une tâche planifiée, et
 * resterait faux entre deux passages.
 *
 * `now` est injectable pour que le comportement soit vérifiable : sans lui,
 * le test dépendrait du jour où on l'exécute.
 */
export function effectivePaymentStatus(
  payment: Pick<RentSchedule, "status" | "month">,
  now: Date = new Date(),
): PaymentStatus {
  if (payment.status !== "pending") return payment.status;

  const endOfMonth = new Date(payment.month);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  return endOfMonth < now ? "late" : "pending";
}

/** Prochaine échéance à régler : la plus ancienne non soldée. */
export function nextDuePayment<T extends { status: PaymentStatus; month: string }>(
  payments: T[],
): T | null {
  return (
    payments
      .filter((p) => p.status !== "paid")
      .sort((a, b) => a.month.localeCompare(b.month))[0] ?? null
  );
}

/**
 * Solde dû, toutes échéances confondues.
 *
 * On soustrait l'acompte éventuel : une échéance partiellement réglée ne
 * doit compter que pour son reliquat, sans quoi le locataire verrait une
 * dette qu'il a déjà entamée.
 */
export function totalOutstanding(
  payments: Pick<RentSchedule, "status" | "amount" | "amount_paid">[],
) {
  return payments
    .filter((p) => p.status !== "paid")
    .reduce((sum, p) => sum + (Number(p.amount) - Number(p.amount_paid)), 0);
}
