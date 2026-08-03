import Link from "next/link";
import { Clock, FileDown } from "lucide-react";

import { DeclarePayment } from "@/components/declare-payment";
import { Pagination } from "@/components/pagination";
import { Card, CardContent, EmptyState, StatusBadge } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import {
  effectivePaymentStatus,
  getTenantPayments,
  totalOutstanding,
} from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  formatDate,
  formatMonth,
  PAYMENT_DECLARATION_STATUS_LABELS,
  PAYMENT_DECLARATION_STATUS_TONES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  type PaymentDeclaration,
} from "@/lib/types";

export const metadata = { title: "Mes loyers — ImmoOps" };

export default async function PortalPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireTenantSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();
  const [payments, { data: declarations }] = await Promise.all([
    getTenantPayments(),
    supabase
      .from("payment_declarations")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<PaymentDeclaration[]>(),
  ]);

  const outstanding = totalOutstanding(payments);
  const today = new Date().toISOString().slice(0, 10);

  // La déclaration la plus récente par échéance : c'est celle qui décrit
  // l'état courant de la demande.
  const latestDeclaration = new Map<string, PaymentDeclaration>();
  for (const declaration of declarations ?? []) {
    if (!latestDeclaration.has(declaration.rent_payment_id)) {
      latestDeclaration.set(declaration.rent_payment_id, declaration);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Mes loyers</h1>

      <Card className="gap-0 py-0">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Reste à régler</p>
          <p
            className={`font-heading mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${
              outstanding > 0 ? "text-destructive" : "text-success"
            }`}
          >
            {formatCurrency(outstanding)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Réglez votre loyer selon les modalités convenues avec votre
            gestionnaire, puis déclarez-le ci-dessous pour qu&apos;il soit
            enregistré.
          </p>
        </CardContent>
      </Card>

      {!payments.length && (
        <EmptyState>Aucune échéance enregistrée pour l&apos;instant.</EmptyState>
      )}

      {/* Le solde ci-dessus porte sur l'historique complet ; seule la liste
          est découpée. Découper aussi le calcul afficherait un « reste à
          régler » qui change quand on tourne la page. */}
      <div className="flex flex-col gap-2">
        {payments.slice(page.from, page.to + 1).map((payment) => {
          const status = effectivePaymentStatus(payment);
          const paid = status === "paid";
          const declaration = latestDeclaration.get(payment.id);
          const awaitingReview = declaration?.status === "pending";
          const remaining = Number(payment.amount) - Number(payment.amount_paid);

          return (
            <Card key={payment.id} className="gap-0 py-0">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{formatMonth(payment.month)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatCurrency(payment.amount)}
                      {payment.amount_paid > 0 && !paid && (
                        <> · réglé {formatCurrency(payment.amount_paid)}</>
                      )}
                    </p>
                    {payment.payment_date && (
                      <p className="text-xs text-muted-foreground">
                        Encaissé le {formatDate(payment.payment_date)}
                      </p>
                    )}
                  </div>
                  <StatusBadge tone={PAYMENT_STATUS_TONES[status]}>
                    {PAYMENT_STATUS_LABELS[status]}
                  </StatusBadge>
                </div>

                {awaitingReview && declaration && (
                  <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-warning/10 p-3">
                    <Clock className="size-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {formatCurrency(declaration.amount)} déclarés
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {declaration.method} · {formatDate(declaration.paid_on)}
                      </p>
                    </div>
                    <StatusBadge
                      tone={PAYMENT_DECLARATION_STATUS_TONES.pending}
                    >
                      {PAYMENT_DECLARATION_STATUS_LABELS.pending}
                    </StatusBadge>
                  </div>
                )}

                {declaration?.status === "rejected" && !paid && (
                  <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                    Votre dernière déclaration n&apos;a pas été confirmée.
                    Rapprochez-vous de votre gestionnaire.
                  </p>
                )}

                {!paid && !awaitingReview && remaining > 0 && (
                  <DeclarePayment
                    paymentId={payment.id}
                    remaining={remaining}
                    today={today}
                  />
                )}

                {paid && (
                  <Link
                    href={`/portal/payments/${payment.id}/receipt`}
                    className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium active:bg-muted"
                  >
                    <FileDown className="size-4" />
                    Quittance
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Pagination
        page={page.number}
        size={page.size}
        total={payments.length}
        unit="échéances"
      />
    </div>
  );
}
