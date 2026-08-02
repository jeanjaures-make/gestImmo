"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject, tenantSchema } from "@/lib/validation";

export async function createTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const parsed = tenantSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").insert({
    organization_id: auth.session.organization.id,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/tenants");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Locataire introuvable." };

  const parsed = tenantSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/tenants");
  revalidatePath("/leases");
  revalidatePath("/dashboard");
  return { ok: true };
}
