"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

/**
 * Carte de plan tarifaire.
 *
 * Les données viennent de la table `plans` — rien n'est codé en dur.
 * Le bouton « Commencer » appelle la route de création de paiement,
 * qui détermine le prix côté serveur.
 */
export function PlanCard({
  plan,
  currentPlanSlug,
  highlighted = false,
}: {
  plan: Plan;
  currentPlanSlug?: string | null;
  /** Offre retenue avant l'inscription : mise en avant, jamais imposée. */
  highlighted?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const isCurrent = currentPlanSlug === plan.slug;
  const isLaunch = plan.is_launch_offer;

  function subscribe() {
    setLoading(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/payments/moneroo/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: plan.id }),
        });

        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error ?? "Impossible de démarrer le paiement.");
          setLoading(false);
          return;
        }

        // Le fournisseur héberge la page de paiement : on y envoie le
        // navigateur. Aucune donnée bancaire ne transite par CaisseOps.
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
        } else {
          toast.error("URL de paiement manquante.");
          setLoading(false);
        }
      } catch {
        toast.error("Une erreur est survenue. Réessayez.");
        setLoading(false);
      }
    });
  }

  const features: string[] = [];
  if (plan.is_unlimited_documents) {
    features.push("Pièces illimitées");
  } else if (plan.document_limit != null) {
    features.push(`Jusqu'à ${plan.document_limit.toLocaleString("fr-FR")} pièces par mois`);
  }
  features.push("Reçus", "Bons de caisse", "Bons de sortie", "Impression à votre en-tête");

  if (!plan.is_unlimited_users) {
    features.push(
      `${plan.user_limit} utilisateur${plan.user_limit === 1 ? "" : "s"}`,
    );
  } else {
    features.push("Utilisateurs illimités");
  }

  // Business et Illimité : rôles et audit. La capacité audit vient de la
  // base (colonne has_audit_log), pas d'un slug codé en dur.
  if (plan.has_audit_log) {
    features.push("Rôles et permissions", "Journal d'audit complet");
  }

  // Illimité : accompagnement. Le slug reste la seule façon de distinguer
  // cette offre spécifique — c'est un positionnement marketing, pas une
  // capacité fonctionnelle.
  if (plan.slug === "unlimited") {
    features.push("Accompagnement à la reprise de données");
  }

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-6 text-card-foreground",
        isLaunch && "border-primary/50 shadow-lg",
        // Le choix d'avant l'inscription prime visuellement sur l'offre de
        // lancement : c'est celui que la personne cherche des yeux.
        highlighted && "border-primary shadow-lg ring-2 ring-primary/30",
      )}
    >
      {isLaunch && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            <Sparkles className="size-3" />
            Offre de lancement
          </span>
        </div>
      )}

      <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-heading text-3xl font-bold tabular-nums">
          {plan.price.toLocaleString("fr-FR")}
        </span>
        <span className="text-sm text-muted-foreground">
          {plan.currency} / mois
        </span>
      </div>

      {plan.description && (
        <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
      )}

      <ul className="mt-5 flex flex-col gap-2.5 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 pt-6">
        {isCurrent ? (
          <Button variant="outline" disabled className="w-full">
            Plan actuel
          </Button>
        ) : (
          <Button
            onClick={subscribe}
            disabled={loading || pending}
            className="w-full"
            variant={isLaunch ? "default" : "outline"}
          >
            {loading || pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Redirection…
              </>
            ) : isLaunch ? (
              "Profiter de l'offre"
            ) : (
              "Commencer"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
