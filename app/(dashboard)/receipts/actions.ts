"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject, receiptSchema } from "@/lib/validation";

/**
 * Émission d'un reçu.
 *
 * Le numéro n'est pas fourni : un déclencheur PostgreSQL l'attribue à
 * l'insertion, sous verrou. Le calculer ici obligerait à lire le dernier
 * numéro puis à écrire — deux caissiers saisissant en même temps
 * obtiendraient le même.
 */
export async function createReceipt(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const parsed = receiptSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("receipts").insert({
    organization_id: auth.session.organization.id,
    created_by: auth.session.userId,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/receipts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateReceipt(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Reçu introuvable." };

  const parsed = receiptSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("receipts")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
