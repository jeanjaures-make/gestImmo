"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject, paymentSchema } from "@/lib/validation";

function revalidateAll() {
  revalidatePath("/payments");
  revalidatePath("/");
}

/**
 * Statuer sur un règlement déclaré par un locataire.
 *
 * Le travail est fait par la fonction SQL `review_payment_declaration` :
 * marquer la déclaration ET encaisser l'échéance doivent réussir ou échouer
 * ensemble. Deux requêtes séparées laisseraient, au moindre incident, une
 * déclaration acceptée sans encaissement — ou l'inverse.
 */
export async function reviewDeclaration(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("declaration_id") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";
  if (!id) return { error: "Déclaration introuvable." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_payment_declaration", {
    p_id: id,
    p_accept: accept,
  });

  if (error) return { error: error.message };

  revalidateAll();
  revalidatePath("/portal/payments");
  return { ok: true };
}

export async function createPayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const parsed = paymentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("rent_payments").insert({
    organization_id: auth.session.organization.id,
    ...parsed.data,
    amount_paid: parsed.data.amount_paid ?? 0,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Une échéance existe déjà pour ce bail et ce mois." };
    }
    return { error: error.message };
  }

  revalidateAll();
  return { ok: true };
}

export async function updatePayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Échéance introuvable." };

  const parsed = paymentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rent_payments")
    .update({ ...parsed.data, amount_paid: parsed.data.amount_paid ?? 0 })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Une échéance existe déjà pour ce bail et ce mois." };
    }
    return { error: error.message };
  }

  revalidateAll();
  return { ok: true };
}

/** Marque une échéance comme encaissée pour son montant total. */
export async function markPaid(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const paymentId = String(formData.get("payment_id") ?? "");
  if (!paymentId) return { error: "Échéance introuvable." };

  const supabase = await createClient();

  const { data: payment, error: readError } = await supabase
    .from("rent_payments")
    .select("amount")
    .eq("id", paymentId)
    .single<{ amount: number }>();

  if (readError) return { error: readError.message };

  const { error } = await supabase
    .from("rent_payments")
    .update({
      status: "paid",
      amount_paid: payment.amount,
      payment_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", paymentId);

  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}
