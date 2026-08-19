"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject, propertySchema } from "@/lib/validation";

/**
 * Les biens mis en location.
 *
 * Mêmes rôles que l'émission d'une pièce : le comptable saisit, le
 * lecteur consulte. Un bien n'est pas une pièce comptable — il ne consomme
 * donc aucun quota et ne dépend pas de l'abonnement pour être décrit.
 * C'est la QUITTANCE qui est la pièce, et elle, vérifie.
 */
export async function createProperty(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const parsed = propertySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("properties").insert({
    organization_id: auth.session.organization.id,
    created_by: auth.session.userId,
    ...parsed.data,
  });

  if (error) return { error: referenceTaken(error) };

  revalidatePath("/properties");
  return { ok: true };
}

export async function updateProperty(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Bien introuvable." };

  const parsed = propertySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: referenceTaken(error) };

  revalidatePath("/properties");
  revalidatePath("/tenants");
  return { ok: true };
}

/**
 * 23505 sur `properties` ne peut venir que de l'unicité de la référence :
 * c'est la seule contrainte de ce type sur la table. Le message de
 * PostgreSQL nomme un index, ce qui n'aide personne au comptoir.
 */
function referenceTaken(error: { code?: string; message: string }) {
  return error.code === "23505"
    ? "Cette référence est déjà utilisée par un autre de vos biens."
    : error.message;
}
