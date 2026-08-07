import Link from "next/link";
import { Printer } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { PageHeader, StatusBadge } from "@/components/ui/kit";
import { canDelete, canIssue, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  CASH_ACCOUNT_LABELS,
  CASH_DIRECTION_LABELS,
  CASH_DIRECTION_TONES,
  CASH_SETTLEMENT_LABELS,
  formatCurrency,
  formatDate,
  type CashVoucher,
} from "@/lib/types";
import { createCashVoucher, updateCashVoucher } from "./actions";
import { CashVoucherFields } from "./fields";

export const metadata = { title: "Bons de caisse — CaisseOps" };

export default async function CashVouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("cash_vouchers")
    .select("*", { count: "exact" })
    .order("issued_on", { ascending: false })
    .order("number", { ascending: false })
    .range(page.from, page.to)
    .returns<CashVoucher[]>();

  const vouchers = data ?? [];
  const editable = canIssue(profile.role);
  const removable = canDelete(profile.role);

  const fields: RecordField<CashVoucher>[] = [
    {
      label: "Numéro",
      role: "title",
      value: (v) => (
        <Link href={`/cash-vouchers/${v.id}`} className="hover:underline">
          {v.number}
        </Link>
      ),
    },
    { label: "Bénéficiaire", role: "subtitle", value: (v) => v.counterparty },
    {
      label: "Sens",
      role: "badge",
      value: (v) => (
        <StatusBadge tone={CASH_DIRECTION_TONES[v.direction]}>
          {CASH_DIRECTION_LABELS[v.direction]}
        </StatusBadge>
      ),
    },
    { label: "Date", value: (v) => formatDate(v.issued_on) },
    { label: "Montant", numeric: true, value: (v) => formatCurrency(v.amount) },
    {
      label: "Règlement",
      value: (v) =>
        v.settlement === "depot" && v.deposit_ref
          ? `Dépôt — ${v.deposit_ref}`
          : CASH_SETTLEMENT_LABELS[v.settlement],
    },
    {
      label: "Imputation",
      role: "hidden",
      value: (v) => CASH_ACCOUNT_LABELS[v.account],
    },
  ];

  return (
    <>
      <PageHeader
        title="Bons de caisse"
        description="Chaque entrée et chaque sortie d'espèces, avec l'ordre qui l'a autorisée."
        action={<ExportButton dataset="bons-de-caisse" />}
      />

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouveau bon de caisse"
            triggerLabel="Nouveau bon de caisse"
            submitLabel="Émettre le bon"
            successMessage="Bon de caisse émis."
            action={createCashVoucher}
          >
            <CashVoucherFields />
          </EntityForm>
        </div>
      )}

      <RecordList
        caption="Bons de caisse émis"
        items={vouchers}
        keyOf={(v) => v.id}
        fields={fields}
        empty="Aucun bon de caisse émis pour l'instant."
        actions={(voucher) => (
          <>
            <Link
              href={`/cash-vouchers/${voucher.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Printer className="size-3.5" />
              Imprimer
            </Link>
            {editable && (
              <RowActions
                entityLabel="Bon de caisse"
                editTitle={`Modifier le bon ${voucher.number}`}
                editAction={updateCashVoucher}
                editFields={<CashVoucherFields voucher={voucher} />}
                deleteTable="cash_vouchers"
                deleteId={voucher.id}
                canDelete={removable}
                deleteDescription={`Le bon ${voucher.number} sera définitivement supprimé. Son numéro ne sera pas réattribué : la numérotation gardera un trou, visible lors d'un contrôle.`}
              />
            )}
          </>
        )}
      />

      <Pagination
        page={page.number}
        size={page.size}
        total={count ?? 0}
        unit="bons de caisse"
      />
    </>
  );
}
