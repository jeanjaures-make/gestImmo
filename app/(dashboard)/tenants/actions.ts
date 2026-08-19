"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject, tenantSchema } from "@/lib/validation";

/**
 * Les locataires, et les termes de leur bail.
 *
 * Le bien affecté n'est pas vérifié ici : la clé étrangère est COMPOSITE
 * — (property_id, organization_id) — donc PostgreSQL refuse déjà de
 * rattacher un locataire au bien d'une autre entreprise. Le revérifier en
 * TypeScript ajouterait une requête et une seconde vérité.
 */
export async function createTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const parsed = tenantSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").insert({
    organization_id: auth.session.organization.id,
    created_by: auth.session.userId,
    ...parsed.data,
  });

  if (error) return { error: unknownProperty(error) };

  revalidatePath("/tenants");
  revalidatePath("/properties");
  return { ok: true };
}

export async function updateTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Locataire introuvable." };

  const parsed = tenantSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update(parsed.data).eq("id", id);

  if (error) return { error: unknownProperty(error) };

  revalidatePath("/tenants");
  revalidatePath("/properties");
  return { ok: true };
}

function unknownProperty(error: { code?: string; message: string }) {
  return error.code === "23503"
    ? "Ce bien n'existe pas chez vous."
    : error.message;
}
