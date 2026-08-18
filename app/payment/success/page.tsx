import Link from "next/link";
import { Loader2 } from "lucide-react";

import { SignupClaim } from "@/components/signup-claim";
import { Button, Card, CardContent } from "@/components/ui/kit";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Paiement reçu — CaisseOps" };

/**
 * Page de retour après paiement.
 *
 * IMPORTANT : on n'affiche jamais « Paiement réussi » ici. Le navigateur
 * qui revient ne prouve rien : cette adresse peut être ouverte à la main.
 * La confirmation vient du webhook, après re-vérification de la
 * transaction auprès du fournisseur.
 *
 * ─── Deux publics, deux affichages ──────────────────────────────────────
 * Un propriétaire déjà connecté qui vient de renouveler ou changer de
 * plan A une session : il n'a rien à réclamer, `/dashboard` suffit. Un
 * visiteur qui vient de PAYER SON INSCRIPTION n'en a aucune — c'est
 * précisément le sujet de cette page — et attend qu'on la lui ouvre, via
 * `SignupClaim` qui sonde `?ref=` (l'identifiant de son intention).
 */
export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const [session, { ref }] = await Promise.all([getSession(), searchParams]);

  const isSignupReturn = !session && ref && /^[0-9a-f-]{36}$/i.test(ref);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {isSignupReturn ? (
            <SignupClaim intentRef={ref} />
          ) : (
            <>
              <div className="flex size-12 items-center justify-center rounded-full bg-success/10">
                <Loader2 className="size-6 animate-spin text-success" />
              </div>

              <h1 className="font-heading text-xl font-semibold">
                Paiement reçu
              </h1>

              <p className="text-sm text-muted-foreground">
                Nous vérifions votre paiement. Votre abonnement sera activé
                automatiquement une fois la vérification terminée —
                généralement en moins d&apos;une minute.
              </p>

              <p className="text-xs text-muted-foreground">
                Vous pouvez fermer cette page. Un rafraîchissement de votre
                tableau de bord affichera votre nouveau plan.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link href="/dashboard">
                  <Button variant="outline">Retour au tableau de bord</Button>
                </Link>
                <Link href="/subscribe">
                  <Button>Voir mes abonnements</Button>
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
