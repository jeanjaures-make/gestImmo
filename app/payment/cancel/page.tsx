import Link from "next/link";
import { XCircle } from "lucide-react";

import { Button, Card, CardContent } from "@/components/ui/kit";

export const metadata = { title: "Paiement annulé — CaisseOps" };

/**
 * Page d'annulation — l'utilisateur a fermé la fenêtre de paiement
 * ou le paiement a été refusé.
 */
export default function PaymentCancelPage() {
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
            La transaction a été interrompue. Aucun montant n&apos;a été
            débité. Vous pouvez réessayer à tout moment.
          </p>

          <div className="mt-4">
            <Link href="/subscribe">
              <Button>Réessayer</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
