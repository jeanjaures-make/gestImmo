"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import {
  firstIssue,
  formDataToObject,
  maintenanceSchema,
} from "@/lib/validation";

export async function createMaintenance(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const parsed = maintenanceSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("maintenance").insert({
    organization_id: auth.session.organization.id,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateMaintenance(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Intervention introuvable." };

  const parsed = maintenanceSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance")
    .update({
      ...parsed.data,
      resolved_at:
        parsed.data.status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateMaintenanceStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("maintenance_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!id) return { error: "Intervention introuvable." };
  if (!["open", "in_progress", "resolved", "cancelled"].includes(status)) {
    return { error: "Statut invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}
