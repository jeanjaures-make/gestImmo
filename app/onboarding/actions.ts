"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  firstIssue,
  formDataToObject,
  organizationSchema,
} from "@/lib/validation";

export type OnboardingState = { error?: string };

export async function createOrganization(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = organizationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // L'organisation et le profil « owner » sont créés dans la même
  // transaction côté PostgreSQL : il n'existe pas d'état intermédiaire où
  // un compte serait sans organisation.
  const { error } = await supabase.rpc("create_organization", {
    org_name: parsed.data.name,
    first_name: parsed.data.firstname ?? "",
    last_name: parsed.data.lastname ?? "",
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
