"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";

/**
 * Actions partagées par le back-office et le portail locataire.
 *
 * Marquer comme lu est le seul écrit permis au destinataire, et la policy
 * `notifications_update` le restreint à ses propres lignes : la clause
 * `.is("read_at", null)` ci-dessous n'est qu'une optimisation, pas une
 * protection.
 */
export async function markNotificationsRead(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!session || session === "no-profile") {
    return { error: "Session expirée." };
  }

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  // Sans identifiant, on solde toute la boîte : c'est le bouton « Tout
  // marquer comme lu ».
  if (id) query = query.eq("id", id);

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath("/notifications");
  revalidatePath("/portal/notifications");
  revalidatePath("/portal");
  revalidatePath("/");
  return { ok: true };
}
