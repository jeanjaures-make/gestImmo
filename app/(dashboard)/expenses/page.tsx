import { FileDown } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/kit";
import { canManage, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  EXPENSE_CATEGORY_LABELS,
  formatCurrency,
  formatDate,
  type Expense,
} from "@/lib/types";
import { createExpense, updateExpense } from "./actions";
import { ExpenseFields } from "./fields";

export const metadata = { title: "Dépenses — ImmoOps" };

type Row = Expense & { buildings: { name: string } | null };

export default async function ExpensesPage() {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const [{ data: expenses, error }, { data: buildings }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, buildings(name)")
      .order("expense_date", { ascending: false })
      .limit(200)
      .returns<Row[]>(),
    supabase.from("buildings").select("id, name").order("name"),
  ]);

  const editable = canManage(profile.role);
  const buildingOptions = buildings ?? [];
  const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0;

  const fields: RecordField<Row>[] = [
    { label: "Libellé", role: "title", value: (e) => e.label },
    {
      label: "Immeuble",
      role: "subtitle",
      value: (e) => e.buildings?.name ?? "—",
    },
    {
      label: "Catégorie",
      role: "badge",
      value: (e) => (
        <StatusBadge tone="neutral">
          {EXPENSE_CATEGORY_LABELS[e.category]}
        </StatusBadge>
      ),
    },
    { label: "Montant", numeric: true, value: (e) => formatCurrency(e.amount) },
    { label: "Date", value: (e) => formatDate(e.expense_date) },
    {
      label: "Facture",
      value: (e) =>
        e.invoice_path ? (
          <a
            href={`/documents/download?path=${encodeURIComponent(e.invoice_path)}`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            <FileDown className="size-3.5" />
            Télécharger
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Dépenses"
        description={
          expenses?.length
            ? `${formatCurrency(total)} sur la période affichée.`
            : "Charges, travaux, taxes et assurances par immeuble."
        }
      />

      {editable && (
        <div className="mb-6">
          {buildingOptions.length ? (
            <EntityForm
              title="Nouvelle dépense"
              triggerLabel="Nouvelle dépense"
              submitLabel="Enregistrer la dépense"
              successMessage="Dépense enregistrée."
              action={createExpense}
            >
              <ExpenseFields buildings={buildingOptions} withInvoice />
            </EntityForm>
          ) : (
            <EmptyState>
              Créez d&apos;abord un immeuble : une dépense y est rattachée.
            </EmptyState>
          )}
        </div>
      )}

      {error && (
        <EmptyState>
          Impossible de charger les dépenses : {error.message}
        </EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Dépenses"
          items={expenses ?? []}
          keyOf={(e) => e.id}
          fields={fields}
          empty="Aucune dépense enregistrée."
          actions={
            editable
              ? (expense) => (
                  <RowActions
                    entityLabel="Dépense"
                    editTitle={`Modifier « ${expense.label} »`}
                    editAction={updateExpense}
                    editFields={
                      <ExpenseFields
                        expense={expense}
                        buildings={buildingOptions}
                      />
                    }
                    deleteTable="expenses"
                    deleteId={expense.id}
                    deleteDescription={`La dépense « ${expense.label} » sera définitivement supprimée. La facture éventuellement stockée restera dans le bucket.`}
                  />
                )
              : undefined
          }
        />
      )}
    </>
  );
}
