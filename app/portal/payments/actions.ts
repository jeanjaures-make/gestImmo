"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTenantSession } from "@/lib/auth";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject } from "@/lib/validation";
import { PAYMENT_METHODS } from "@/lib/types";

const declarationSchema = z.object({
  rent_payment_id: z.uuid({ message: "Échéance invalide." }),
  amount: z
    .string()
    .trim()
    .transform((v) => (v === "" ? Number.NaN : Number(v.replace(",", "."))))
    .pipe(
      z
        .number({ message: "Montant invalide." })
        .positive({ message: "Le montant doit être supérieur à zéro." }),
    ),
  paid_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date invalide." }),
  method: z.enum(PAYMENT_METHODS, { message: "Moyen de paiement invalide." }),
  reference: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v)),
});

/**
 * Le locataire signale un règlement effectué hors ligne.
 *
 * Ce n'est PAS un encaissement : `rent_payments` reste intact jusqu'à ce
 * qu'un gestionnaire valide la déclaration. Un locataire ne peut donc pas
 * solder sa propre dette en remplissant un formulaire.
 */
export async function declarePayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { organization, tenantId } = await requireTenantSession();

  const limit = await rateLimit({
    key: await callerKey("declare-payment"),
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) {
    return { error: "Trop de déclarations envoyées. Réessayez plus tard." };
  }

  const parsed = declarationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();

  // Le RLS ne renvoie que les échéances de ses propres baux : une échéance
  // introuvable ici est soit inexistante, soit celle de quelqu'un d'autre.
  const { data: payment } = await supabase
    .from("rent_payments")
    .select("id, amount, amount_paid, status")
    .eq("id", parsed.data.rent_payment_id)
    .maybeSingle<{
      id: string;
      amount: number;
      amount_paid: number;
      status: string;
    }>();

  if (!payment) return { error: "Échéance introuvable." };
  if (payment.status === "paid") {
    return { error: "Cette échéance est déjà soldée." };
  }

  const remaining = Number(payment.amount) - Number(payment.amount_paid);
  if (parsed.data.amount > remaining) {
    return {
      error: `Le montant dépasse le reste à régler (${remaining.toFixed(2)} €).`,
    };
  }

  const { error } = await supabase.from("payment_declarations").insert({
    organization_id: organization.id,
    rent_payment_id: payment.id,
    tenant_id: tenantId,
    amount: parsed.data.amount,
    paid_on: parsed.data.paid_on,
    method: parsed.data.method,
    reference: parsed.data.reference,
    status: "pending",
  });

  if (error) {
    // 23505 : l'index partiel `payment_declarations_one_pending` a joué —
    // une déclaration est déjà en attente sur cette échéance.
    if (error.code === "23505") {
      return {
        error:
          "Une déclaration est déjà en attente de validation pour cette échéance.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/portal/payments");
  revalidatePath("/portal");
  return { ok: true };
}
