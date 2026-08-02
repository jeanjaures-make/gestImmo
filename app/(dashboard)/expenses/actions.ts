"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { buildStoragePath, DOCUMENTS_BUCKET } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { expenseSchema, firstIssue, formDataToObject } from "@/lib/validation";

const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
const ALLOWED_INVOICE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export async function createExpense(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const parsed = expenseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const invoice = formData.get("invoice");
  let invoicePath: string | null = null;

  if (invoice instanceof File && invoice.size > 0) {
    if (invoice.size > MAX_INVOICE_BYTES) {
      return { error: "La facture dépasse 10 Mo." };
    }
    if (!ALLOWED_INVOICE_TYPES.includes(invoice.type)) {
      return { error: "Format accepté : PDF, PNG, JPEG ou WebP." };
    }

    // Le premier segment du chemin est l'organisation : c'est exactement ce
    // que la policy RLS du bucket compare.
    const path = buildStoragePath({
      organizationId: auth.session.organization.id,
      ownerType: "expense",
      ownerId: parsed.data.building_id,
      fileName: invoice.name,
    });

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, invoice, { contentType: invoice.type, upsert: false });

    if (uploadError) {
      return { error: `Envoi de la facture impossible : ${uploadError.message}` };
    }
    invoicePath = path;
  }

  const { error } = await supabase.from("expenses").insert({
    organization_id: auth.session.organization.id,
    ...parsed.data,
    invoice_path: invoicePath,
  });

  if (error) {
    // Ne pas laisser un fichier orphelin dans le bucket.
    if (invoicePath) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([invoicePath]);
    }
    return { error: error.message };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateExpense(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Dépense introuvable." };

  const parsed = expenseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  // La facture n'est pas modifiable ici : la remplacer demanderait de
  // supprimer l'ancien objet du bucket, ce qui mérite son propre parcours.
  const { error } = await supabase
    .from("expenses")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}
