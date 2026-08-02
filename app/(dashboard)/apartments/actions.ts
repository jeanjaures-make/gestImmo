"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import {
  apartmentSchema,
  firstIssue,
  formDataToObject,
} from "@/lib/validation";

export async function createApartment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const parsed = apartmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();

  // `organization_id` est repris de la session, jamais du formulaire. La clé
  // étrangère composite (building_id, organization_id) rejette d'office un
  // immeuble appartenant à une autre organisation.
  const { error } = await supabase.from("apartments").insert({
    organization_id: auth.session.organization.id,
    ...parsed.data,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ce numéro de logement existe déjà dans cet immeuble." };
    }
    if (error.code === "23503") {
      return { error: "Immeuble introuvable dans votre organisation." };
    }
    return { error: error.message };
  }

  revalidatePath("/apartments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateApartment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Logement introuvable." };

  const parsed = apartmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("apartments")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ce numéro de logement existe déjà dans cet immeuble." };
    }
    if (error.code === "23503") {
      return { error: "Immeuble introuvable dans votre organisation." };
    }
    return { error: error.message };
  }

  revalidatePath("/apartments");
  revalidatePath("/leases");
  revalidatePath("/dashboard");
  return { ok: true };
}
