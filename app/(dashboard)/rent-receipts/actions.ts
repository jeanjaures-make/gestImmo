"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { getActiveSubscription } from "@/lib/subscriptions";
import {
  firstIssue,
  formDataToObject,
  rentReceiptSchema,
} from "@/lib/validation";

/**
 * Émission d'une quittance de loyer.
 *
 * ─── Ce que le serveur décide, et pas le formulaire ────────────────────
 * Le NUMÉRO : attribué par un déclencheur PostgreSQL sous verrou, comme
 * pour un reçu. Deux gestionnaires qui émettent en même temps ne peuvent
 * pas obtenir le même.
 *
 * Le TOTAL : recalculé ici à partir des trois postes. L'accepter du
 * formulaire permettrait d'émettre une quittance dont la somme contredit
 * son propre détail — un document qui ne tient pas devant un juge.
 *
 * ─── Abonnement, et non quota de pièces ────────────────────────────────
 * Une quittance exige un abonnement actif : le produit n'est pas gratuit.
 * Elle ne décompte en revanche PAS le quota de pièces, qui couvre les
 * reçus, bons de caisse et bons de sortie. Mêler les deux compteurs
 * changerait, sans qu'on l'ait demandé, ce que les clients déjà abonnés
 * croient avoir acheté. C'est une décision commerciale, révisable en une
 * ligne — voir `count_documents_this_period` dans `subscriptions.sql`.
 */
export async function createRentReceipt(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const subscription = await getActiveSubscription(auth.session.organization.id);
  if (!subscription) {
    return {
      error:
        "Aucun abonnement actif. Souscrivez un plan pour émettre des quittances.",
    };
  }

  const parsed = rentReceiptSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // Un brouillon se corrige ; une quittance émise, non. Le choix se fait
  // ici, une seule fois — la base refuse ensuite tout retour en arrière.
  const status =
    String(formData.get("status") ?? "issued") === "draft" ? "draft" : "issued";

  const supabase = await createClient();
  const { error } = await supabase.from("rent_receipts").insert({
    organization_id: auth.session.organization.id,
    created_by: auth.session.userId,
    status,
    ...parsed.data,
    total_amount: total(parsed.data),
  });

  if (error) return { error: error.message };

  revalidatePath("/rent-receipts");
  return { ok: true };
}

/**
 * Correction d'un brouillon.
 *
 * Le déclencheur `guard_rent_receipt` refuse la même opération sur une
 * quittance émise : l'application n'a pas à répéter cette règle, elle a
 * seulement à en présenter le motif lisiblement.
 */
export async function updateRentReceipt(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Quittance introuvable." };

  const parsed = rentReceiptSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rent_receipts")
    .update({ ...parsed.data, total_amount: total(parsed.data) })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/rent-receipts");
  revalidatePath(`/rent-receipts/${id}`);
  return { ok: true };
}

/** Un brouillon devient définitif. */
export async function issueRentReceipt(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Quittance introuvable." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rent_receipts")
    .update({ status: "issued" })
    .eq("id", id)
    .eq("status", "draft");

  if (error) return { error: error.message };

  revalidatePath("/rent-receipts");
  revalidatePath(`/rent-receipts/${id}`);
  return { ok: true };
}

/**
 * Annulation — jamais une suppression.
 *
 * La ligne reste, avec sa date et son motif, et son numéro n'est pas
 * réattribué. C'est ce qu'un contrôle attend d'un carnet à souche : un
 * numéro qui manque sans explication vaut un soupçon.
 *
 * Réservée au propriétaire et au gestionnaire, comme la suppression d'une
 * pièce de caisse : le geste doit rester rare et engager quelqu'un.
 */
export async function cancelRentReceipt(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Quittance introuvable." };

  const reason = String(formData.get("cancel_reason") ?? "").trim().slice(0, 300);
  if (!reason) return { error: "Indiquez le motif de l'annulation." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rent_receipts")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
    })
    .eq("id", id)
    .neq("status", "cancelled");

  if (error) return { error: error.message };

  revalidatePath("/rent-receipts");
  revalidatePath(`/rent-receipts/${id}`);
  return { ok: true };
}

/** Le total imprimé : loyer, charges et frais divers. */
function total(v: {
  rent_amount: number;
  charges_amount: number;
  other_fees: number;
}) {
  return v.rent_amount + v.charges_amount + v.other_fees;
}
