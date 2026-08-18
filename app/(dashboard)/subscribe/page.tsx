import { redirect } from "next/navigation";

import { PlanCard } from "@/components/plan-card";
import { PageHeader } from "@/components/ui/kit";
import { canAdminister, requireSession } from "@/lib/auth";
import { safePlanSlug } from "@/lib/plan-choice";
import { getActivePlans, getActiveSubscription } from "@/lib/subscriptions";

export const metadata = { title: "Abonnement — CaisseOps" };

/**
 * Page de sélection du plan.
 *
 * Les plans viennent de la base de données — jamais codés en dur.
 *
 * Réservée au propriétaire : c'est lui qui engage la dépense, et la
 * policy d'insertion sur `subscriptions` n'autorise que lui. Sans cette
 * garde, un caissier verrait des boutons qui échouent en base — une
 * impasse plutôt qu'un refus lisible.
 */
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; plan?: string }>;
}) {
  const { organization, profile } = await requireSession();
  if (!canAdminister(profile.role)) redirect("/dashboard");

  const [{ reason, plan: requested }, plans, activeSub] = await Promise.all([
    searchParams,
    getActivePlans(),
    getActiveSubscription(organization.id),
  ]);

  const currentPlanSlug = activeSub?.plan_slug ?? null;

  // L'offre retenue au moment de l'inscription. On la met en avant plutôt
  // que de la présélectionner en dur : la personne doit pouvoir changer
  // d'avis ici, et la voir mise en évidence lui évite de la rechercher.
  const chosenSlug = safePlanSlug(requested);
  const chosen = plans.find((p) => p.slug === chosenSlug) ?? null;

  return (
    <>
      <PageHeader
        title="Choisissez votre plan"
        description="Souscrivez en ligne. Le paiement est traité par Moneroo : mobile money ou carte, selon ce que propose votre pays."
      />

      {reason === "audit" && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">Journal d&apos;audit indisponible sur votre offre</p>
          <p className="mt-0.5 text-muted-foreground">
            Le journal complet est inclus à partir de l&apos;offre Business.
            Choisissez un plan ci-dessous pour y accéder.
          </p>
        </div>
      )}

      {chosen && !activeSub && (
        <div className="mb-6 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">
            Vous aviez choisi l&apos;offre {chosen.name}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Elle est mise en avant ci-dessous. Rien n&apos;est engagé : vous
            pouvez encore en prendre une autre.
          </p>
        </div>
      )}

      {activeSub && (
        <div className="mb-6 rounded-lg border border-success/40 bg-success/5 p-4 text-sm">
          <p className="font-medium">
            Abonnement actuel : {activeSub.plan_name}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Expire le{" "}
            {new Date(activeSub.expires_at ?? "").toLocaleDateString("fr-FR")}.
            Vous pouvez changer de plan à tout moment.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentPlanSlug={currentPlanSlug}
            highlighted={plan.slug === chosenSlug}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Paiements traités par Moneroo. CaisseOps ne voit ni ne conserve
        aucune donnée bancaire : la page de paiement est hébergée par le
        fournisseur, et les clés restent côté serveur.
      </p>
    </>
  );
}
