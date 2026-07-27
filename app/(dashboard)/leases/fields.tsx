import { Field, Input, NativeSelect } from "@/components/ui/kit";
import { LEASE_STATUS_LABELS, type Lease } from "@/lib/types";

export type TenantOption = {
  id: string;
  firstname: string;
  lastname: string;
};

export type ApartmentOption = {
  id: string;
  number: string;
  buildings: { name: string } | null;
};

export function LeaseFields({
  lease,
  tenants,
  apartments,
}: {
  lease?: Lease;
  tenants: TenantOption[];
  apartments: ApartmentOption[];
}) {
  return (
    <>
      <Field label="Locataire">
        <NativeSelect name="tenant_id" defaultValue={lease?.tenant_id} required>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.firstname} {t.lastname}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Logement">
        <NativeSelect
          name="apartment_id"
          defaultValue={lease?.apartment_id}
          required
        >
          {apartments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.buildings?.name ? `${a.buildings.name} — ` : ""}
              {a.number}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Loyer (€)">
        <Input
          name="rent"
          type="number"
          step="0.01"
          min="0"
          defaultValue={lease?.rent}
          required
        />
      </Field>
      <Field label="Charges (€)">
        <Input
          name="charges"
          type="number"
          step="0.01"
          min="0"
          defaultValue={lease?.charges ?? 0}
        />
      </Field>
      <Field label="Dépôt de garantie (€)">
        <Input
          name="deposit"
          type="number"
          step="0.01"
          min="0"
          defaultValue={lease?.deposit ?? 0}
        />
      </Field>
      <Field label="Date de début">
        <Input
          name="start_date"
          type="date"
          defaultValue={lease?.start_date}
          required
        />
      </Field>
      <Field label="Date de fin" hint="Laisser vide si indéterminée.">
        <Input name="end_date" type="date" defaultValue={lease?.end_date ?? ""} />
      </Field>
      <Field label="Statut">
        <NativeSelect name="status" defaultValue={lease?.status ?? "active"}>
          {Object.entries(LEASE_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  );
}
