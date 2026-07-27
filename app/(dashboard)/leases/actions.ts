"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject, leaseSchema } from "@/lib/validation";

function revalidateAll() {
  revalidatePath("/leases");
  revalidatePath("/apartments");
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function createLease(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const parsed = leaseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: lease, error } = await supabase
    .from("leases")
    .insert({
      organization_id: auth.session.organization.id,
      ...parsed.data,
      charges: parsed.data.charges ?? 0,
      deposit: parsed.data.deposit ?? 0,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ce logement a déjà un bail actif." };
    }
    if (error.code === "23503") {
      return {
        error: "Locataire ou logement introuvable dans votre organisation.",
      };
    }
    return { error: error.message };
  }

  // Le statut du logement est mis à jour par un trigger PostgreSQL, pas ici :
  // aucun chemin d'écriture ne peut l'oublier.
  if (formData.get("generate_schedule") === "on") {
    const { error: rpcError } = await supabase.rpc("generate_rent_schedule", {
      p_lease_id: lease.id,
      p_months: 12,
    });
    if (rpcError) {
      return {
        ok: true,
        error: `Bail créé, mais les échéances n'ont pas pu être générées : ${rpcError.message}`,
      };
    }
  }

  revalidateAll();
  return { ok: true };
}

export async function updateLease(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Bail introuvable." };

  const parsed = leaseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leases")
    .update({
      ...parsed.data,
      charges: parsed.data.charges ?? 0,
      deposit: parsed.data.deposit ?? 0,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ce logement a déjà un bail actif." };
    }
    if (error.code === "23514") {
      return { error: "La date de fin doit être postérieure à la date de début." };
    }
    return { error: error.message };
  }

  revalidateAll();
  return { ok: true };
}

/**
 * Clôture un bail : le trigger `leases_sync_apartment_status` remet
 * automatiquement le logement en « Libre » s'il n'a plus de bail actif.
 */
export async function closeLease(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const leaseId = String(formData.get("lease_id") ?? "");
  const endDate = String(formData.get("end_date") ?? "").trim();

  if (!leaseId) return { error: "Bail introuvable." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "Indiquez une date de fin valide." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leases")
    .update({ status: "ended", end_date: endDate })
    .eq("id", leaseId);

  if (error) {
    if (error.code === "23514") {
      return { error: "La date de fin doit être postérieure au début du bail." };
    }
    return { error: error.message };
  }

  revalidateAll();
  return { ok: true };
}

/** Génère les échéances de loyer manquantes sur les 12 prochains mois. */
export async function generateSchedule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager", "accountant");
  if (!auth.ok) return { error: auth.error };

  const leaseId = String(formData.get("lease_id") ?? "");
  if (!leaseId) return { error: "Bail introuvable." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_rent_schedule", {
    p_lease_id: leaseId,
    p_months: 12,
  });

  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}
