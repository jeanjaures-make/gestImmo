import Link from "next/link";
import { XCircle } from "lucide-react";

import { Button, Card, CardContent } from "@/components/ui/kit";

export const metadata = { title: "Paiement annulé — CaisseOps" };

/**
 * Page d'annulation / interruption après redirection Chariow (/billing/cancel).
 *
 * Elle informe clairement l'utilisateur :
 * - Le paiement a été interrompu et aucun abonnement n'a été activé.
 * - Aucun montant n'a été débité.
 * - Propose de retourner aux offres/tarification ou au tableau de bord.
 */
export default function BillingCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="size-6 text-destructive" />
          </div>

          <h1 className="font-heading text-xl font-semibold">
            Le paiement n&apos;a pas été finalisé
          </h1>

          <p className="text-sm text-muted-foreground">
            La transaction a été interrompue ou annulée. Votre abonnement
            n&apos;a pas été activé et aucun montant n&apos;a été débité.
          </p>

          <p className="text-xs text-muted-foreground">
            Vous pouvez réessayer votre paiement à tout moment ou choisir une autre
            offre.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/subscribe">
              <Button>Voir les offres</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline">Tableau de bord</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
