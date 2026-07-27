import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PrintButton } from "@/components/print-button";
import { Card, CardContent } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatMonth } from "@/lib/types";

export const metadata = { title: "Quittance — ImmoOps" };

type Receipt = {
  id: string;
  month: string;
  amount: number;
  amount_paid: number;
  status: string;
  payment_date: string | null;
  leases: {
    rent: number;
    charges: number;
    tenants: { firstname: string; lastname: string } | null;
    apartments: {
      number: string;
      buildings: { name: string; address: string; city: string } | null;
    } | null;
  } | null;
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireTenantSession();
  const { id } = await params;

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("rent_payments")
    .select(
      "id, month, amount, amount_paid, status, payment_date, leases(rent, charges, tenants(firstname, lastname), apartments(number, buildings(name, address, city)))",
    )
    .eq("id", id)
    .maybeSingle<Receipt>();

  // Le RLS renvoie simplement « rien » pour l'échéance d'un autre locataire :
  // indiscernable d'un identifiant inexistant, ce qui est le comportement
  // souhaité — aucune information n'est divulguée.
  if (!payment) notFound();

  if (payment.status !== "paid") {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/portal/payments"
          className="flex min-h-11 items-center gap-1 text-sm text-primary"
        >
          <ChevronLeft className="size-4" />
          Retour
        </Link>
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Une quittance ne peut être délivrée que pour une échéance
            intégralement réglée.
          </CardContent>
        </Card>
      </div>
    );
  }

  const tenant = payment.leases?.tenants;
  const apartment = payment.leases?.apartments;
  const building = apartment?.buildings;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/portal/payments"
        className="flex min-h-11 items-center gap-1 text-sm text-primary print:hidden"
      >
        <ChevronLeft className="size-4" />
        Retour
      </Link>

      <Card className="gap-0 py-0 print:border-0 print:shadow-none">
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground">{organization.name}</p>
          <h1 className="font-heading mt-1 text-lg font-semibold">
            Quittance de loyer
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatMonth(payment.month)}
          </p>

          <div className="mt-5 space-y-1 text-sm">
            <p className="text-xs text-muted-foreground">Locataire</p>
            <p className="font-medium">
              {tenant ? `${tenant.firstname} ${tenant.lastname}` : "—"}
            </p>
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <p className="text-xs text-muted-foreground">Logement</p>
            <p className="font-medium">
              {building?.name ?? "Logement"}
              {apartment?.number ? ` · ${apartment.number}` : ""}
            </p>
            {building && (
              <p className="text-muted-foreground">
                {building.address}, {building.city}
              </p>
            )}
          </div>

          <dl className="mt-5 border-t pt-4 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-muted-foreground">Loyer hors charges</dt>
              <dd>{formatCurrency(payment.leases?.rent ?? 0)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-muted-foreground">Charges</dt>
              <dd>{formatCurrency(payment.leases?.charges ?? 0)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
              <dt>Total réglé</dt>
              <dd>{formatCurrency(payment.amount_paid)}</dd>
            </div>
          </dl>

          <p className="mt-5 text-sm text-muted-foreground">
            Reçu le {formatDate(payment.payment_date)}. Cette quittance annule
            et remplace tout reçu antérieur pour la même période.
          </p>
        </CardContent>
      </Card>

      <PrintButton />
    </div>
  );
}
