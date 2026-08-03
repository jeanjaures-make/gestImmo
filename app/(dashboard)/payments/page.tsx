import { BadgeCheck } from "lucide-react";

import { DeclarationReview } from "@/components/declaration-review";
import { EntityForm } from "@/components/entity-form";
import { ExportButton } from "@/components/export-button";
import { MarkPaid } from "@/components/mark-paid";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import {
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui/kit";
import { canRecordPayments, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  formatDate,
  formatMonth,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  type PaymentDeclaration,
  type PaymentStatus,
  type RentPayment,
} from "@/lib/types";
import { createPayment, updatePayment } from "./actions";
import { PaymentFields, type LeaseOption } from "./fields";

export const metadata = { title: "Paiements — ImmoOps" };

type Row = RentPayment & {
  leases: {
    tenants: { firstname: string; lastname: string } | null;
    apartments: { number: string } | null;
  } | null;
};

type PendingDeclaration = PaymentDeclaration & {
  tenants: { firstname: string; lastname: string } | null;
  rent_payments: { month: string; amount: number } | null;
};

/** Une échéance non soldée dont le mois est révolu est en retard. */
function effectiveStatus(payment: RentPayment): PaymentStatus {
  if (payment.status !== "pending") return payment.status;
  const endOfMonth = new Date(payment.month);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  return endOfMonth < new Date() ? "late" : "pending";
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);
  const supabase = await createClient();

  const [
    { data: payments, error, count },
    { data: leases },
    { data: pending },
    { data: unsettled },
  ] = await Promise.all([
      supabase
        .from("rent_payments")
        .select("*, leases(tenants(firstname, lastname), apartments(number))", {
          count: "exact",
        })
        .order("month", { ascending: false })
        .range(page.from, page.to)
        .returns<Row[]>(),
      supabase
        .from("leases")
        .select("id, tenants(firstname, lastname), apartments(number)")
        .eq("status", "active")
        .returns<LeaseOption[]>(),
      supabase
        .from("payment_declarations")
        .select(
          "*, tenants(firstname, lastname), rent_payments(month, amount)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .returns<PendingDeclaration[]>(),
      // Le reste à encaisser porte sur TOUT le parc, pas sur la page
      // affichée : additionner les seules lignes visibles donnerait un
      // montant qui change quand on tourne la page. Requête distincte,
      // limitée aux échéances non soldées et aux deux colonnes utiles.
      supabase
        .from("rent_payments")
        .select("amount, amount_paid")
        .neq("status", "paid")
        .returns<{ amount: number; amount_paid: number }[]>(),
    ]);

  const editable = canRecordPayments(profile.role);
  const leaseOptions = leases ?? [];
  const outstanding = (unsettled ?? []).reduce(
    (sum, p) => sum + (Number(p.amount) - Number(p.amount_paid)),
    0,
  );

  const nameOf = (row: Row) =>
    row.leases?.tenants
      ? `${row.leases.tenants.firstname} ${row.leases.tenants.lastname}`
      : "—";

  const fields: RecordField<Row>[] = [
    { label: "Mois", role: "title", value: (p) => formatMonth(p.month) },
    {
      label: "Locataire",
      role: "subtitle",
      value: (p) =>
        `${nameOf(p)}${p.leases?.apartments?.number ? ` · ${p.leases.apartments.number}` : ""}`,
    },
    {
      label: "Statut",
      role: "badge",
      value: (p) => {
        const status = effectiveStatus(p);
        return (
          <StatusBadge tone={PAYMENT_STATUS_TONES[status]}>
            {PAYMENT_STATUS_LABELS[status]}
          </StatusBadge>
        );
      },
    },
    { label: "Dû", numeric: true, value: (p) => formatCurrency(p.amount) },
    {
      label: "Encaissé",
      numeric: true,
      value: (p) => formatCurrency(p.amount_paid),
    },
    { label: "Date", value: (p) => formatDate(p.payment_date) },
  ];

  return (
    <>
      <PageHeader
        title="Paiements"
        description={
          outstanding > 0
            ? `${formatCurrency(outstanding)} restent à encaisser, toutes échéances confondues.`
            : "Historique des échéances de loyer."
        }
        action={<ExportButton dataset="paiements" />}
      />

      {/* En tête d'écran : un règlement déclaré attend une décision, il ne
          doit pas se perdre au milieu de deux cents échéances. */}
      {editable && !!pending?.length && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">
            Règlements déclarés ({pending.length})
          </h2>
          <div className="flex flex-col gap-2">
            {pending.map((declaration) => {
              const who = declaration.tenants
                ? `${declaration.tenants.firstname} ${declaration.tenants.lastname}`
                : "Locataire";

              return (
                <Card
                  key={declaration.id}
                  className="gap-0 border-warning/40 py-0"
                >
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <BadgeCheck className="size-5 shrink-0 text-warning" />
                    <div className="min-w-56 flex-1">
                      <p className="text-sm font-medium">
                        {who} déclare {formatCurrency(declaration.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {declaration.rent_payments
                          ? `${formatMonth(declaration.rent_payments.month)} · `
                          : ""}
                        {declaration.method} ·{" "}
                        {formatDate(declaration.paid_on)}
                        {declaration.reference
                          ? ` · réf. ${declaration.reference}`
                          : ""}
                      </p>
                    </div>
                    <DeclarationReview
                      declarationId={declaration.id}
                      tenantName={who}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {editable && (
        <div className="mb-6">
          {leaseOptions.length ? (
            <EntityForm
              title="Nouvelle échéance"
              triggerLabel="Nouvelle échéance"
              submitLabel="Enregistrer"
              successMessage="Échéance enregistrée."
              action={createPayment}
            >
              <PaymentFields leases={leaseOptions} />
            </EntityForm>
          ) : (
            <EmptyState>
              Aucun bail actif : créez un bail pour suivre ses loyers.
            </EmptyState>
          )}
        </div>
      )}

      {error && (
        <EmptyState>
          Impossible de charger les paiements : {error.message}
        </EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Échéances de loyer"
          items={payments ?? []}
          keyOf={(p) => p.id}
          fields={fields}
          empty="Aucune échéance. Elles peuvent être générées automatiquement à la création d'un bail."
          actions={
            editable
              ? (payment) => (
                  <div className="flex items-center justify-end gap-2">
                    {effectiveStatus(payment) !== "paid" && (
                      <MarkPaid paymentId={payment.id} />
                    )}
                    <RowActions
                      entityLabel="Échéance"
                      editTitle={`Modifier l'échéance de ${formatMonth(payment.month)}`}
                      editAction={updatePayment}
                      editFields={
                        <PaymentFields
                          payment={payment}
                          leases={leaseOptions}
                        />
                      }
                      deleteTable="rent_payments"
                      deleteId={payment.id}
                      deleteDescription={`L'échéance de ${formatMonth(payment.month)} pour ${nameOf(payment)} sera définitivement supprimée.`}
                    />
                  </div>
                )
              : undefined
          }
        />
      )}

      {!error && (
        <Pagination
          page={page.number}
          size={page.size}
          total={count ?? 0}
          unit="échéances"
        />
      )}
    </>
  );
}
