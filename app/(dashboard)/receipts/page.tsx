import Link from "next/link";
import { Printer } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { PageHeader } from "@/components/ui/kit";
import { canAdminister, canDelete, canIssue, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { getSubscriptionState } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, type Receipt } from "@/lib/types";
import { createReceipt, updateReceipt } from "./actions";
import { ReceiptFields } from "./fields";

export const metadata = { title: "Reçus — CaisseOps" };

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile, organization } = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);
  const subscription = await getSubscriptionState(organization.id);

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("receipts")
    .select("*", { count: "exact" })
    // Le numéro en second critère : deux reçus du même jour se rangent
    // alors dans l'ordre où ils ont été émis, pas au hasard.
    .order("issued_on", { ascending: false })
    .order("number", { ascending: false })
    .range(page.from, page.to)
    .returns<Receipt[]>();

  const receipts = data ?? [];
  const editable = canIssue(profile.role);
  const removable = canDelete(profile.role);

  const fields: RecordField<Receipt>[] = [
    {
      label: "Numéro",
      role: "title",
      value: (r) => (
        <Link href={`/receipts/${r.id}`} className="hover:underline">
          {r.number}
        </Link>
      ),
    },
    { label: "Reçu de", role: "subtitle", value: (r) => r.payer },
    { label: "Date", value: (r) => formatDate(r.issued_on) },
    {
      label: "Montant",
      numeric: true,
      value: (r) => formatCurrency(r.amount),
    },
    {
      label: "Reste",
      numeric: true,
      value: (r) => (r.balance ? formatCurrency(r.balance) : "—"),
    },
    {
      label: "Article(s)",
      role: "hidden",
      value: (r) => r.articles || "—",
    },
  ];

  return (
    <>
      <PageHeader
        title="Reçus"
        description="La trace remise à celui qui paie. Chaque reçu porte votre en-tête et un numéro continu."
        action={<ExportButton dataset="recus" />}
      />

      <SubscriptionBanner
        state={subscription}
        canSubscribe={canAdminister(profile.role)}
      />

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouveau reçu"
            triggerLabel="Nouveau reçu"
            submitLabel="Émettre le reçu"
            successMessage="Reçu émis."
            action={createReceipt}
          >
            <ReceiptFields />
          </EntityForm>
        </div>
      )}

      <RecordList
        caption="Reçus émis"
        items={receipts}
        keyOf={(r) => r.id}
        fields={fields}
        empty="Aucun reçu émis pour l'instant."
        actions={(receipt) => (
          <>
            <Link
              href={`/receipts/${receipt.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Printer className="size-3.5" />
              Imprimer
            </Link>
            {editable && (
              <RowActions
                entityLabel="Reçu"
                editTitle={`Modifier le reçu ${receipt.number}`}
                editAction={updateReceipt}
                editFields={<ReceiptFields receipt={receipt} />}
                deleteTable="receipts"
                deleteId={receipt.id}
                canDelete={removable}
                deleteDescription={`Le reçu ${receipt.number} sera définitivement supprimé. Son numéro ne sera pas réattribué : la numérotation gardera un trou, visible lors d'un contrôle.`}
              />
            )}
          </>
        )}
      />

      <Pagination
        page={page.number}
        size={page.size}
        total={count ?? 0}
        unit="reçus"
      />
    </>
  );
}
