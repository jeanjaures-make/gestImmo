import { Field, Input, NativeSelect } from "@/components/ui/kit";
import { CURRENCY_LABEL } from "@/lib/money";
import { PAYMENT_STATUS_LABELS, type RentPayment } from "@/lib/types";

export type LeaseOption = {
  id: string;
  tenants: { firstname: string; lastname: string } | null;
  apartments: { number: string } | null;
};

export function PaymentFields({
  payment,
  leases,
}: {
  payment?: RentPayment;
  leases: LeaseOption[];
}) {
  return (
    <>
      <Field label="Bail">
        <NativeSelect name="lease_id" defaultValue={payment?.lease_id} required>
          {leases.map((l) => (
            <option key={l.id} value={l.id}>
              {l.tenants
                ? `${l.tenants.firstname} ${l.tenants.lastname}`
                : "Locataire"}
              {l.apartments ? ` — ${l.apartments.number}` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Mois" hint="Normalisé au 1er du mois.">
        <Input
          name="month"
          type="date"
          defaultValue={payment?.month}
          required
        />
      </Field>
      <Field label={`Montant dû (${CURRENCY_LABEL})`}>
        <Input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={payment?.amount}
          required
        />
      </Field>
      <Field label={`Montant encaissé (${CURRENCY_LABEL})`}>
        <Input
          name="amount_paid"
          type="number"
          step="0.01"
          min="0"
          defaultValue={payment?.amount_paid ?? 0}
        />
      </Field>
      <Field label="Statut">
        <NativeSelect name="status" defaultValue={payment?.status ?? "pending"}>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Date d'encaissement">
        <Input
          name="payment_date"
          type="date"
          defaultValue={payment?.payment_date ?? ""}
        />
      </Field>
      <Field label="Moyen">
        <Input
          name="method"
          placeholder="Virement"
          defaultValue={payment?.method ?? ""}
        />
      </Field>
      <Field label="Note">
        <Input name="note" defaultValue={payment?.note ?? ""} />
      </Field>
    </>
  );
}
