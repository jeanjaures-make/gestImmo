"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import {
  deliveryNoteSchema,
  firstIssue,
  formDataToObject,
  readDeliveryLines,
} from "@/lib/validation";

export async function createDeliveryNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const parsed = deliveryNoteSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lines = readDeliveryLines(formData);
  if (!lines.success) return { error: firstIssue(lines.error) };

  const supabase = await createClient();
  const organizationId = auth.session.organization.id;

  const { data: note, error } = await supabase
    .from("delivery_notes")
    .insert({
      organization_id: organizationId,
      created_by: auth.session.userId,
      ...parsed.data,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  const { error: linesError } = await supabase
    .from("delivery_note_lines")
    .insert(
      lines.data.map((line, position) => ({
        organization_id: organizationId,
        delivery_note_id: note.id,
        position,
        ...line,
      })),
    );

  if (linesError) {
    // Un bon sans article n'a pas de sens : plutôt que de le laisser en
    // l'état, on le retire. Son numéro est perdu — c'est le prix de
    // l'attribution sous verrou, et cela vaut mieux qu'une pièce vide qui
    // circulerait.
    await supabase.from("delivery_notes").delete().eq("id", note.id);
    return { error: linesError.message };
  }

  revalidatePath("/delivery-notes");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Modification d'un bon de sortie.
 *
 * Les lignes sont remplacées en bloc plutôt que rapprochées une à une :
 * l'utilisateur peut en insérer, en retirer et en réordonner dans le même
 * geste, et un rapprochement se tromperait inévitablement sur les
 * réordonnancements. Le journal d'audit conserve l'avant et l'après.
 */
export async function updateDeliveryNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Bon de sortie introuvable." };

  const parsed = deliveryNoteSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lines = readDeliveryLines(formData);
  if (!lines.success) return { error: firstIssue(lines.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("delivery_notes")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  const { error: clearError } = await supabase
    .from("delivery_note_lines")
    .delete()
    .eq("delivery_note_id", id);

  if (clearError) return { error: clearError.message };

  const { error: linesError } = await supabase
    .from("delivery_note_lines")
    .insert(
      lines.data.map((line, position) => ({
        organization_id: auth.session.organization.id,
        delivery_note_id: id,
        position,
        ...line,
      })),
    );

  if (linesError) return { error: linesError.message };

  revalidatePath("/delivery-notes");
  revalidatePath(`/delivery-notes/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
