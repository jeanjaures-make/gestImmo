import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { LeaseStatus, PaymentStatus } from "@/lib/types";

export type PortalLease = {
  id: string;
  rent: number;
  charges: number;
  deposit: number;
  status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  apartments: {
    id: string;
    number: string;
    floor: string | null;
    surface: number | null;
    type: string | null;
    buildings: { id: string; name: string; address: string; city: string } | null;
  } | null;
};

export type PortalPayment = {
  id: string;
  lease_id: string;
  month: string;
  amount: number;
  amount_paid: number;
  status: PaymentStatus;
  payment_date: string | null;
};

/**
 * Baux du locataire connecté, le plus récent d'abord.
 * Aucun filtre applicatif : le RLS ne renvoie que ses propres baux.
 */
export const getTenantLeases = cache(async (): Promise<PortalLease[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leases")
    .select(
      "id, rent, charges, deposit, status, start_date, end_date, apartments(id, number, floor, surface, type, buildings(id, name, address, city))",
    )
    .order("start_date", { ascending: false })
    .returns<PortalLease[]>();

  return data ?? [];
});

export const getTenantPayments = cache(async (): Promise<PortalPayment[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rent_payments")
    .select("id, lease_id, month, amount, amount_paid, status, payment_date")
    .order("month", { ascending: false })
    .limit(48)
    .returns<PortalPayment[]>();

  return data ?? [];
});

/** Le bail en cours, ou à défaut le plus récent. */
export function activeLease(leases: PortalLease[]) {
  return leases.find((l) => l.status === "active") ?? leases[0] ?? null;
}

/** Une échéance non soldée dont le mois est révolu est en retard. */
export function effectivePaymentStatus(
  payment: Pick<PortalPayment, "status" | "month">,
): PaymentStatus {
  if (payment.status !== "pending") return payment.status;
  const endOfMonth = new Date(payment.month);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  return endOfMonth < new Date() ? "late" : "pending";
}

/** Prochaine échéance à régler : la plus ancienne non soldée. */
export function nextDuePayment(payments: PortalPayment[]) {
  return (
    payments
      .filter((p) => p.status !== "paid")
      .sort((a, b) => a.month.localeCompare(b.month))[0] ?? null
  );
}

export function totalOutstanding(payments: PortalPayment[]) {
  return payments
    .filter((p) => p.status !== "paid")
    .reduce((sum, p) => sum + (Number(p.amount) - Number(p.amount_paid)), 0);
}
