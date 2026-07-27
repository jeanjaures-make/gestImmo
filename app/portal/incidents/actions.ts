"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTenantSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject } from "@/lib/validation";
import { activeLease, getTenantLeases } from "@/lib/portal";

const incidentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { message: "Décrivez l'incident en quelques mots." })
    .max(160),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === "" ? null : v)),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export async function declareIncident(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { organization } = await requireTenantSession();

  const parsed = incidentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lease = activeLease(await getTenantLeases());
  const apartmentId = lease?.apartments?.id;
  const buildingId = lease?.apartments?.buildings?.id;

  if (!lease || !apartmentId || !buildingId) {
    return {
      error:
        "Aucun logement actif n'est rattaché à votre compte. Contactez votre gestionnaire.",
    };
  }

  const supabase = await createClient();
  // `status: open` est imposé ici ET par la policy RLS d'insertion : un
  // locataire ne peut pas déposer un incident déjà « résolu ».
  const { error } = await supabase.from("maintenance").insert({
    organization_id: organization.id,
    building_id: buildingId,
    apartment_id: apartmentId,
    title: parsed.data.title,
    description: parsed.data.description,
    priority: parsed.data.priority,
    status: "open",
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/incidents");
  revalidatePath("/portal");
  redirect("/portal/incidents");
}
