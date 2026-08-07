"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import {
  cashVoucherSchema,
  firstIssue,
  formDataToObject,
} from "@/lib/validation";

export async function createCashVoucher(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const parsed = cashVoucherSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("cash_vouchers").insert({
    organization_id: auth.session.organization.id,
    created_by: auth.session.userId,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/cash-vouchers");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateCashVoucher(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Bon de caisse introuvable." };

  const parsed = cashVoucherSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_vouchers")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/cash-vouchers");
  revalidatePath(`/cash-vouchers/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
