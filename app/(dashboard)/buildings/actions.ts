"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import {
  buildingSchema,
  firstIssue,
  formDataToObject,
} from "@/lib/validation";

export async function createBuilding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const parsed = buildingSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("buildings").insert({
    organization_id: auth.session.organization.id,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/buildings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateBuilding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Immeuble introuvable." };

  const parsed = buildingSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  // `organization_id` n'est jamais réécrit : un immeuble ne change pas
  // d'organisation, et le RLS empêcherait de toute façon la manœuvre.
  const { error } = await supabase
    .from("buildings")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/buildings");
  revalidatePath("/dashboard");
  return { ok: true };
}
