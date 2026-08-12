import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button, Card, CardContent } from "@/components/ui/kit";

export const metadata = { title: "Paiement reçu — CaisseOps" };

/**
 * Page de retour après paiement.
 *
 * IMPORTANT : on n'affiche jamais « Paiement réussi » ici. Le navigateur
 * qui revient ne prouve rien : cette adresse peut être ouverte à la main.
 * La confirmation vient du webhook, après re-vérification de la
 * transaction auprès du fournisseur.
 *
 * L'utilisateur voit « Paiement reçu, vérification en cours ». Son
 * abonnement s'activera automatiquement quand le webhook aura traité.
 */
export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
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
        </CardContent>
      </Card>
    </div>
  );
}
