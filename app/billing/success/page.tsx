import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

import { SignupClaim } from "@/components/signup-claim";
import { Button, Card, CardContent } from "@/components/ui/kit";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/subscriptions";

export const metadata = { title: "Paiement reçu — CaisseOps" };

/**
 * Page de confirmation / vérification après paiement PayDunya (/billing/success).
 *
 * IMPORTANT :
 * - L'arrivée sur cette page n'est JAMAIS considérée comme une preuve de paiement.
 * - Cette page ne modifie AUCUNE donnée et n'active aucun abonnement directement.
 * - Le statut réel provient de Supabase, mis à jour par l'IPN PayDunya.
 *
 * ─── Deux cas de figure ──────────────────────────────────────────────────
 * 1. Nouvel utilisateur (inscription payante) :
 *    Il n'a pas encore de session Supabase. `?ref=` contient l'UUID de son
 *    intention (`signup_intents`). Le composant `SignupClaim` sonde
 *    `/api/signup/status` et, dès confirmation du webhook par Supabase,
 *    réclame l'accès et ouvre la session.
 *
 * 2. Propriétaire connecté (souscription / renouvellement / changement de plan) :
 *    Il a déjà une session. La page interroge Supabase pour savoir si
 *    l'abonnement actif est déjà à jour suite au webhook Chariow :
 *    - Si oui : affiche que l'abonnement est actif.
 *    - Si le webhook est encore en cours de traitement : affiche l'état
 *      « Paiement reçu — activation de votre abonnement en cours... ».
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const [session, { ref }] = await Promise.all([getSession(), searchParams]);

  const isSignupReturn = !session && ref && /^[0-9a-f-]{36}$/i.test(ref);

  let activeSub = null;
  if (session && session !== "no-profile") {
    activeSub = await getActiveSubscription(session.organization.id);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {isSignupReturn ? (
            <SignupClaim intentRef={ref} />
          ) : activeSub ? (
            <>
              <div className="flex size-12 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="size-6 text-success" />
              </div>

              <h1 className="font-heading text-xl font-semibold">
                Abonnement actif
              </h1>

              <p className="text-sm text-muted-foreground">
                Votre abonnement au plan <strong>{activeSub.plan_name}</strong> est
                actif et confirmé. Vous pouvez utiliser toutes les fonctionnalités de
                votre compte.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link href="/dashboard">
                  <Button>Accéder au tableau de bord</Button>
                </Link>
                <Link href="/subscribe">
                  <Button variant="outline">Gérer mon abonnement</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="flex size-12 items-center justify-center rounded-full bg-success/10">
                <Loader2 className="size-6 animate-spin text-success" />
              </div>

              <h1 className="font-heading text-xl font-semibold">
                Paiement reçu — activation en cours...
              </h1>

              <p className="text-sm text-muted-foreground">
                Nous vérifions la confirmation de votre paiement auprès de Chariow.
                Votre abonnement sera activé automatiquement dès confirmation du
                webhook — généralement en quelques secondes.
              </p>

              <p className="text-xs text-muted-foreground">
                Vous pouvez retourner sur votre espace. Les fonctionnalités se
                débloqueront instantanément dès réception du signal.
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
