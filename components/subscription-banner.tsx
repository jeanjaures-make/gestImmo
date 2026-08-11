import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/kit";
import { formatCurrency } from "@/lib/money";
import type { SubscriptionState } from "@/lib/subscriptions";

/**
 * L'état de l'abonnement, en tête du tableau de bord.
 *
 * Trois situations méritent d'interrompre la lecture :
 *
 *   — aucun abonnement : les pièces ne peuvent pas être émises, et rien
 *     dans l'écran ne l'expliquerait autrement qu'au moment de l'échec ;
 *   — abonnement échu : même conséquence, mais l'utilisateur connaît
 *     déjà son plan, on lui propose de le reprendre ;
 *   — quota proche ou atteint : on prévient avant le blocage, pas après.
 *
 * Un abonnement actif et loin de sa limite n'affiche rien. Un bandeau
 * permanent « tout va bien » ne serait plus lu le jour où il change.
 */
export function SubscriptionBanner({
  state,
  canSubscribe,
}: {
  state: SubscriptionState;
  /** Seul le propriétaire peut souscrire : aux autres on ne promet rien. */
  canSubscribe: boolean;
}) {
  if (state.state === "none") {
    return (
      <Notice
        tone="danger"
        title="Aucun abonnement actif"
        detail="Choisissez un plan pour commencer à émettre des reçus, des bons de caisse et des bons de sortie."
        action={canSubscribe ? "Voir les offres" : undefined}
      />
    );
  }

  if (state.state === "expired") {
    return (
      <Notice
        tone="danger"
        title={`Votre abonnement ${state.planName} a expiré`}
        detail={`Échu le ${new Date(state.expiredOn).toLocaleDateString("fr-FR")}. Vos pièces restent consultables et imprimables ; l'émission reprend dès le renouvellement.`}
        action={canSubscribe ? "Renouveler" : undefined}
      />
    );
  }

  const { subscription: sub, used } = state;
  if (sub.is_unlimited_documents || sub.document_limit == null) return null;

  const limit = sub.document_limit;
  const remaining = limit - used;

  // Le seuil est proportionnel : prévenir à dix pièces près aurait du
  // sens sur Starter (100) et n'en aurait aucun sur Business (1 000),
  // où l'alerte tomberait alors que la journée est déjà perdue.
  const nearLimit = used >= limit * 0.8;
  if (!nearLimit) return null;

  const reached = used >= limit;

  return (
    <Notice
      tone={reached ? "danger" : "warning"}
      title={
        reached
          ? `Limite atteinte : ${used} / ${limit} pièces`
          : `${used} / ${limit} pièces utilisées`
      }
      detail={
        reached
          ? `Votre plan ${sub.plan_name} ne permet plus d'émettre ce mois-ci. Passez à l'offre supérieure pour reprendre immédiatement.`
          : `Il vous reste ${remaining} pièce${remaining > 1 ? "s" : ""} sur votre plan ${sub.plan_name} (${formatCurrency(sub.price)} par mois).`
      }
      action={canSubscribe ? "Changer de plan" : undefined}
    />
  );
}

function Notice({
  tone,
  title,
  detail,
  action,
}: {
  tone: "danger" | "warning";
  title: string;
  detail: string;
  action?: string;
}) {
  const Icon = tone === "danger" ? CircleAlert : AlertTriangle;

  const body = (
    <Card
      className={`gap-0 py-0 ${
        tone === "danger" ? "border-destructive/40" : "border-warning/40"
      } ${action ? "active:bg-muted" : ""}`}
    >
      <CardContent className="flex min-h-14 items-center gap-3 p-4">
        <Icon
          className={`size-4 shrink-0 ${
            tone === "danger" ? "text-destructive" : "text-warning"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        {action && (
          <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary sm:flex">
            {action}
            <ArrowRight className="size-4" />
          </span>
        )}
      </CardContent>
    </Card>
  );

  if (!action) return <div className="mb-5">{body}</div>;

  return (
    <Link href="/subscribe" className="mb-5 block">
      {body}
    </Link>
  );
}
