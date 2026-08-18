import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import Link from "next/link";

import { Button, Card, CardContent } from "@/components/ui/kit";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Impasse explicative pour un compte rattaché à aucune organisation.
 *
 * ─── Ce que cet écran ÉTAIT, et pourquoi il ne l'est plus ───────────────
 * Il portait le formulaire de création d'organisation : on s'inscrivait,
 * on nommait son entreprise, et l'espace existait — le paiement venait
 * après, ou jamais. Depuis que l'inscription est subordonnée au paiement,
 * une organisation naît par un seul chemin : `provision_signup_intent`,
 * appelée par le webhook Moneroo après encaissement confirmé. La RPC
 * `create_organization` est révoquée pour `authenticated` : ce formulaire
 * n'aurait plus rien pu créer, et le laisser aurait promis un geste que
 * la base refuse.
 *
 * ─── Qui atterrit ici, alors ────────────────────────────────────────────
 * Une anomalie, jamais un parcours : un compte authentifié dont le profil
 * a disparu. Un collaborateur retiré de son équipe dont le compte
 * d'authentification a survécu au retrait (clé de service absente à ce
 * moment-là), ou une inscription de l'ancien parcours libre restée en
 * plan. Les renvoyer sans un mot les laisserait tourner en rond entre
 * `/login` et un tableau de bord qui les rejette.
 *
 * Le chemin de sortie est le même que pour tout le monde : choisir une
 * offre, et payer. C'est précisément ce que cet écran ne fait plus à leur
 * place.
 *
 * Le nom de route est conservé — `lib/auth.ts` y renvoie, `app/robots.ts`
 * l'exclut déjà de l'indexation — mais il ne décrit plus une mise en
 * route : il nomme une sortie de secours.
 */
export const metadata = { title: "Compte sans organisation — CaisseOps" };

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
          <span className="font-heading text-lg font-semibold">CaisseOps</span>
        </div>

        <Card>
          <CardContent className="p-6">
            <h1 className="font-heading mb-1 text-lg font-semibold">
              Votre compte n&apos;est rattaché à aucune organisation
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Cela arrive après le retrait d&apos;une équipe, ou si une
              inscription ne s&apos;est jamais achevée. Vos identifiants
              restent valables : il ne leur manque qu&apos;un abonnement pour
              ouvrir un espace.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/offres" className="sm:flex-1">
                <Button className="w-full">Choisir une offre</Button>
              </Link>
              {/* POST, comme dans l'en-tête du back-office : la route
                  refuse le GET, qu'un préchargement de lien suffirait à
                  déclencher. */}
              <form action="/auth/signout" method="post" className="sm:flex-1">
                <Button type="submit" variant="outline" className="w-full">
                  Se déconnecter
                </Button>
              </form>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Si vous avez été retiré d&apos;une équipe par erreur, demandez à
              son propriétaire de vous inviter à nouveau — vous retrouverez
              alors vos pièces, sans souscrire quoi que ce soit.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
