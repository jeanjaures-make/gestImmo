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

/**
 * Toutes les échéances du locataire.
 *
 * Sans borne : le solde dû et la prochaine échéance se calculent sur
 * l'historique entier. Un plafond arbitraire — c'était 48 — faisait mentir
 * le total dès la cinquième année de bail. Le volume reste celui d'un seul
 * locataire, soit une ligne par mois.
 */
export const getTenantPayments = cache(async (): Promise<PortalPayment[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rent_payments")
    .select("id, lease_id, month, amount, amount_paid, status, payment_date")
    .order("month", { ascending: false })
    .returns<PortalPayment[]>();

  return data ?? [];
});

// Les règles de lecture d'un bail vivent dans `lib/rent.ts` : sans accès à
// la base, elles se vérifient sans elle. Réexportées ici pour que les
// écrans conservent un point d'entrée unique.
export {
  activeLease,
  effectivePaymentStatus,
  nextDuePayment,
  totalOutstanding,
} from "@/lib/rent";
