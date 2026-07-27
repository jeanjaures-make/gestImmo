"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import type { UserRole } from "@/lib/types";

/**
 * Suppression générique.
 *
 * La table cible vient du formulaire : elle est donc filtrée par une liste
 * blanche fermée. Aucune valeur hors de ce dictionnaire n'atteint SQL, et
 * le RLS reste la dernière barrière si un rôle passait entre les mailles.
 */
const DELETABLE: Record<
  string,
  { roles: UserRole[]; paths: string[]; label: string }
> = {
  buildings: {
    roles: ["owner", "manager"],
    paths: ["/buildings", "/apartments", "/", "/expenses", "/maintenance"],
    label: "immeuble",
  },
  apartments: {
    roles: ["owner", "manager"],
    paths: ["/apartments", "/leases", "/"],
    label: "logement",
  },
  tenants: {
    roles: ["owner", "manager"],
    paths: ["/tenants", "/leases", "/"],
    label: "locataire",
  },
  leases: {
    roles: ["owner", "manager"],
    paths: ["/leases", "/apartments", "/payments", "/"],
    label: "bail",
  },
  rent_payments: {
    roles: ["owner", "manager", "accountant"],
    paths: ["/payments", "/"],
    label: "échéance",
  },
  expenses: {
    roles: ["owner", "manager"],
    paths: ["/expenses", "/"],
    label: "dépense",
  },
  maintenance: {
    roles: ["owner", "manager"],
    paths: ["/maintenance", "/"],
    label: "intervention",
  },
};

export async function deleteEntity(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const table = String(formData.get("table") ?? "");
  const id = String(formData.get("id") ?? "");

  const config = DELETABLE[table];
  if (!config) return { error: "Ressource inconnue." };
  if (!id) return { error: "Élément introuvable." };

  const auth = await authorize(...config.roles);
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);

  if (error) {
    // 23503 : des enregistrements dépendent de celui-ci et le schéma
    // interdit la cascade. Message métier plutôt que code PostgreSQL.
    if (error.code === "23503") {
      return {
        error: `Ce ${config.label} est encore référencé et ne peut pas être supprimé.`,
      };
    }
    return { error: error.message };
  }

  for (const path of config.paths) revalidatePath(path);
  return { ok: true };
}
