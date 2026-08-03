"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/logo";
import { reportError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { firstIssue, formDataToObject } from "@/lib/validation";

export type OnboardingState = { error?: string };

/**
 * Mise en route d'une organisation.
 *
 * On demande davantage que le seul nom de la société : le premier immeuble
 * et, si l'utilisateur le veut, son premier logement. Un tableau de bord
 * vide au premier écran ne montre rien du produit et laisse l'utilisateur
 * devant une page blanche — c'est précisément le moment où l'on abandonne.
 * Trois champs de plus, et il arrive sur son parc.
 *
 * Tout ce qui suit la création de l'organisation est facultatif : un échec
 * sur le logo ou l'immeuble ne doit pas priver l'utilisateur d'un compte
 * déjà créé et opérationnel.
 */
const onboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Le nom de l'organisation est obligatoire." })
    .max(120),
  firstname: z.string().trim().max(80).optional().default(""),
  lastname: z.string().trim().max(80).optional().default(""),
  building_name: z.string().trim().max(120).optional().default(""),
  building_city: z.string().trim().max(120).optional().default(""),
  building_address: z.string().trim().max(200).optional().default(""),
  apartment_number: z.string().trim().max(40).optional().default(""),
});

type Onboarding = z.infer<typeof onboardingSchema>;

export async function createOrganization(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // L'organisation et le profil « owner » naissent dans la même
  // transaction PostgreSQL : il n'existe pas d'état intermédiaire où un
  // compte serait sans organisation.
  const { data: organizationId, error } = await supabase.rpc(
    "create_organization",
    {
      org_name: parsed.data.name,
      first_name: parsed.data.firstname,
      last_name: parsed.data.lastname,
    },
  );

  if (error) {
    if (/appartient déjà/i.test(error.message)) {
      // Page rechargée après coup : l'organisation existe, rien à réparer.
      redirect("/dashboard");
    }
    return { error: error.message };
  }

  const orgId = organizationId as string;
  await attachLogo(formData.get("logo"), orgId);
  await createFirstBuilding(parsed.data, orgId);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Dépose le logo et l'attache à l'organisation.
 *
 * Silencieux en cas d'échec : un logo refusé ne doit pas faire échouer une
 * inscription. L'utilisateur le reposera depuis ses paramètres.
 */
async function attachLogo(value: FormDataEntryValue | null, orgId: string) {
  if (!(value instanceof File) || value.size === 0) return;
  if (value.size > LOGO_MAX_BYTES) return;
  if (!(LOGO_TYPES as readonly string[]).includes(value.type)) return;

  try {
    const supabase = await createClient();
    const extension = value.name.split(".").pop()?.toLowerCase() ?? "png";

    // Chemin préfixé par l'organisation : la policy du bucket s'appuie
    // dessus pour interdire un dépôt sous une autre.
    const path = `${orgId}/logo.${extension}`;

    const { error } = await supabase.storage
      .from("logos")
      .upload(path, value, { upsert: true, contentType: value.type });
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("logos").getPublicUrl(path);

    await supabase
      .from("organizations")
      .update({ logo_url: publicUrl })
      .eq("id", orgId);
  } catch (cause) {
    reportError(cause, { scope: "onboarding-logo", organizationId: orgId });
  }
}

/** Crée l'immeuble puis, s'il est renseigné, le premier logement. */
async function createFirstBuilding(data: Onboarding, orgId: string) {
  if (!data.building_name) return;

  try {
    const supabase = await createClient();
    const { data: building, error } = await supabase
      .from("buildings")
      .insert({
        organization_id: orgId,
        name: data.building_name,
        // Adresse et ville restent facultatives ici : on veut trois champs
        // à l'inscription, pas une fiche complète. Elles se complètent
        // ensuite depuis l'écran de l'immeuble.
        address: data.building_address || "À compléter",
        city: data.building_city || "À compléter",
      })
      .select("id")
      .single();

    if (error) throw error;

    if (data.apartment_number) {
      await supabase.from("apartments").insert({
        organization_id: orgId,
        building_id: building.id,
        number: data.apartment_number,
      });
    }
  } catch (cause) {
    // Le compte est créé et utilisable : l'utilisateur ajoutera son
    // immeuble depuis l'écran dédié.
    reportError(cause, { scope: "onboarding-building", organizationId: orgId });
  }
}
