import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { OnboardingForm } from "@/components/onboarding-form";
import { Card, CardContent } from "@/components/ui/kit";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Votre organisation — ImmoOps" };

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const session = await getSession();
  if (session === null) redirect("/login");
  // Déjà rattaché à une organisation : rien à faire ici.
  if (session !== "no-profile") redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-6" />
          </span>
          <span className="font-heading text-lg font-semibold">ImmoOps</span>
        </div>

        <Card>
          <CardContent className="p-6">
            <h1 className="font-heading mb-1 text-lg font-semibold">
              Créons votre organisation
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Elle cloisonne l&apos;intégralité de vos données. Vous en serez le
              propriétaire et pourrez y inviter des collaborateurs.
            </p>

            <OnboardingForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
