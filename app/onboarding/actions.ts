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
 * On demande davantage que le seul nom de la société : le logo et les
 * coordonnées qui s'impriment en haut de chaque pièce. C'est la raison
 * d'être du produit — un reçu sans en-tête ne vaut pas mieux qu'un carnet
 * du commerce. Trois champs de plus, et la première pièce émise porte déjà
 * l'identité de l'entreprise.
 *
 * Tout ce qui suit la création de l'organisation est facultatif : un échec
 * sur le logo ou l'en-tête ne doit pas priver l'utilisateur d'un compte
 * déjà créé et opérationnel. Ces champs se complètent depuis les Réglages.
 */
const onboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Le nom de l'organisation est obligatoire." })
    .max(120),
  firstname: z.string().trim().max(80).optional().default(""),
  lastname: z.string().trim().max(80).optional().default(""),
  legal_form: z.string().trim().max(40).optional().default(""),
  phone: z.string().trim().max(60).optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
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
  await saveLetterhead(parsed.data, orgId);

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

/**
 * Complète l'en-tête imprimé, si l'utilisateur l'a renseigné.
 *
 * Les champs vides ne sont pas écrits : `create_organization()` a laissé
 * `NULL`, et un `''` prendrait la place d'une valeur inconnue — l'en-tête
 * imprimerait alors une ligne vide plutôt que d'omettre la ligne.
 */
async function saveLetterhead(data: Onboarding, orgId: string) {
  const patch = Object.fromEntries(
    (["legal_form", "phone", "address"] as const)
      .filter((field) => data[field])
      .map((field) => [field, data[field]]),
  );

  if (Object.keys(patch).length === 0) return;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update(patch)
      .eq("id", orgId);
    if (error) throw error;
  } catch (cause) {
    // Le compte est créé et utilisable : l'utilisateur complétera son
    // en-tête depuis les Réglages.
    reportError(cause, {
      scope: "onboarding-letterhead",
      organizationId: orgId,
    });
  }
}
