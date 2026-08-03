import { Field, Input, NativeSelect } from "@/components/ui/kit";
import { CURRENCY_LABEL } from "@/lib/money";
import { EXPENSE_CATEGORY_LABELS, type Expense } from "@/lib/types";

export function ExpenseFields({
  expense,
  buildings,
  withInvoice = false,
}: {
  expense?: Expense;
  buildings: { id: string; name: string }[];
  /** L'upload n'est proposé qu'à la création : remplacer un fichier
   *  existant demande de nettoyer l'ancien objet du bucket. */
  withInvoice?: boolean;
}) {
  return (
    <>
      <Field label="Immeuble">
        <NativeSelect
          name="building_id"
          defaultValue={expense?.building_id}
          required
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Catégorie">
        <NativeSelect name="category" defaultValue={expense?.category ?? "other"}>
          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Libellé">
        <Input
          name="label"
          placeholder="Ravalement façade"
          defaultValue={expense?.label}
          required
        />
      </Field>
      <Field label={`Montant (${CURRENCY_LABEL})`}>
        <Input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={expense?.amount}
          required
        />
      </Field>
      <Field label="Date">
        <Input
          name="expense_date"
          type="date"
          required
          defaultValue={
            expense?.expense_date ?? new Date().toISOString().slice(0, 10)
          }
        />
      </Field>
      {withInvoice && (
        <Field label="Facture" hint="PDF ou image, 10 Mo maximum.">
          <Input
            name="invoice"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          />
        </Field>
      )}
    </>
  );
}
