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
  receipts: {
    roles: ["owner", "manager"],
    paths: ["/receipts", "/dashboard"],
    label: "reçu",
  },
  cash_vouchers: {
    roles: ["owner", "manager"],
    paths: ["/cash-vouchers", "/dashboard"],
    label: "bon de caisse",
  },
  // Les articles partent avec le bon : la clé étrangère composite est
  // déclarée ON DELETE CASCADE, aucun ménage applicatif n'est nécessaire.
  delivery_notes: {
    roles: ["owner", "manager"],
    paths: ["/delivery-notes", "/dashboard"],
    label: "bon de sortie",
  },
  // Un bien encore rattaché à un locataire ou à une quittance ne part pas :
  // les clés étrangères sont déclarées RESTRICT, et le 23503 remonte avec
  // le message métier ci-dessous.
  properties: {
    roles: ["owner", "manager"],
    paths: ["/properties", "/tenants"],
    label: "bien",
  },
  tenants: {
    roles: ["owner", "manager"],
    paths: ["/tenants", "/properties"],
    label: "locataire",
  },
  // Les quittances ne figurent PAS ici, et c'est délibéré : une quittance
  // émise s'annule, elle ne se supprime pas. Le déclencheur
  // `guard_rent_receipt` refuse d'ailleurs la suppression au niveau de la
  // base — l'omettre de cette liste évite seulement de proposer un geste
  // que PostgreSQL rejetterait.
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
