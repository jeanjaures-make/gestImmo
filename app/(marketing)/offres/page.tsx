import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import {
  Panel,
  PrimaryLink,
  Section,
  SecondaryLink,
  SectionHeading,
} from "@/components/marketing/ui";
import { formatCurrency } from "@/lib/money";
import { getActivePlans } from "@/lib/subscriptions";
import { PLAN_HIGHLIGHTS } from "@/lib/plan-highlights";

export const metadata = {
  title: "Nos offres — CaisseOps",
  description:
    "Trois offres mensuelles : Starter, Business et Illimité. Choisissez la vôtre, puis créez votre compte.",
};

/**
 * Choix de l'offre, avant l'inscription.
 *
 * ─── Pourquoi choisir d'abord ───────────────────────────────────────────
 * L'ordre précédent — créer un compte, nommer son entreprise, découvrir
 * ensuite qu'il faut payer — fait porter tout l'effort avant d'annoncer
 * le prix. On demande donc la décision en premier : elle est brève, et
 * elle est celle qui engage.
 *
 * ─── Les prix viennent de la base ───────────────────────────────────────
 * `getActivePlans()` lit la table `plans`, la même source que la page
 * d'abonnement et que la route de paiement. Recopier les montants ici en
 * aurait fait une seconde vérité, qui se serait tôt ou tard écartée de la
 * première — au détriment de qui lit la page. Seuls les arguments de
 * vente, qui n'ont pas leur place en base, vivent dans le code.
 */
export const dynamic = "force-dynamic";

export default async function OffresPage() {
  const plans = await getActivePlans();

  return (
    <Section className="py-16 sm:py-24">
      <SectionHeading
        eyebrow="Offres"
        title="Choisissez votre offre"
        lead="Sans engagement, sans carte bancaire à l'inscription. Vous réglez par mobile money ou par carte, et vous changez d'offre quand vous voulez."
      />

      {plans.length === 0 ? (
        <Panel className="mt-10 p-6">
          <p className="leading-relaxed text-[var(--m-ink-soft)]">
            Les offres ne sont pas consultables pour l&apos;instant. Écrivez-nous
            et nous ouvrons votre accès.
          </p>
        </Panel>
      ) : (
        <ul className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const highlight = PLAN_HIGHLIGHTS[plan.slug];
            const featured = plan.is_launch_offer;

            return (
              <li key={plan.id} className="h-full">
                <Panel
                  className={`flex h-full flex-col p-6 ${
                    featured ? "border-[var(--m-deep)] shadow-sm" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-lg font-semibold">
                      {plan.name}
                    </h2>
                    {featured && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--m-sage)]/12 px-2.5 py-0.5 text-xs font-medium text-[var(--m-sage-text)]">
                        <Sparkles aria-hidden className="size-3" />
                        Offre de lancement
                      </span>
                    )}
                  </div>

                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="font-heading text-3xl font-semibold tracking-tight">
                      {formatCurrency(plan.price)}
                    </span>
                    <span className="text-sm text-[var(--m-ink-soft)]">
                      / mois
                    </span>
                  </p>

                  {highlight?.pitch && (
                    <p className="mt-3 leading-relaxed text-[var(--m-ink-soft)]">
                      {highlight.pitch}
                    </p>
                  )}

                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {(highlight?.features ?? []).map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <Check
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-[var(--m-sage-text)]"
                        />
                        <span className="text-[var(--m-ink-soft)]">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    {featured ? (
                      <PrimaryLink
                        href={`/signup?plan=${plan.slug}`}
                        className="w-full"
                      >
                        Profiter de l&apos;offre
                      </PrimaryLink>
                    ) : (
                      <SecondaryLink
                        href={`/signup?plan=${plan.slug}`}
                        className="w-full"
                      >
                        Choisir {plan.name}
                      </SecondaryLink>
                    )}
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-10 text-center text-sm text-[var(--m-ink-soft)]">
        Vous avez déjà un compte ?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--m-deep)] underline underline-offset-4"
        >
          Se connecter
        </Link>
      </p>
    </Section>
  );
}
