import { redirect } from "next/navigation";

import { PlanCard } from "@/components/plan-card";
import { PageHeader } from "@/components/ui/kit";
import { canAdminister, requireSession } from "@/lib/auth";
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
export default async function SubscribePage() {
  const { organization, profile } = await requireSession();
  if (!canAdminister(profile.role)) redirect("/dashboard");

  const [plans, activeSub] = await Promise.all([
    getActivePlans(),
    getActiveSubscription(organization.id),
  ]);

  const currentPlanSlug = activeSub?.plan_slug ?? null;

  return (
    <>
      <PageHeader
        title="Choisissez votre plan"
        description="Souscrivez en ligne via CinetPay. Paiement de test en Sandbox — aucune somme réelle n'est débitée."
      />

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
          />
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Paiements sécurisés par CinetPay. Environnement de test — aucune
        transaction réelle. Les clés CinetPay restent côté serveur.
      </p>
    </>
  );
}
