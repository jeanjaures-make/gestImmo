import { Field, Input, NativeSelect, Textarea } from "@/components/ui/kit";
import { CURRENCY_LABEL, type Property, type Tenant } from "@/lib/types";

/**
 * Les champs d'un locataire, et les termes de son bail.
 *
 * Le loyer figure ici alors qu'il figure déjà sur le bien : ce n'est pas
 * une redite. Celui du BAIL fait foi — une remise consentie, un ancien
 * bail non réévalué — et c'est lui qui alimentera la quittance.
 */
export function TenantFields({
  tenant,
  properties,
  defaultPropertyId,
}: {
  tenant?: Tenant;
  properties: Property[];
  /** Pré-sélection quand on arrive depuis la fiche d'un bien. */
  defaultPropertyId?: string;
}) {
  return (
    <>
      <Field label="Nom complet">
        <Input
          name="full_name"
          required
          maxLength={160}
          placeholder="Konan Yao"
          defaultValue={tenant?.full_name}
        />
      </Field>

      <Field label="Téléphone">
        <Input
          name="phone"
          type="tel"
          maxLength={60}
          placeholder="07 00 00 00 00"
          defaultValue={tenant?.phone}
        />
      </Field>

      <Field label="Adresse e-mail">
        <Input
          name="email"
          type="email"
          maxLength={160}
          placeholder="konan.yao@exemple.ci"
          defaultValue={tenant?.email ?? ""}
        />
      </Field>

      <Field
        label="Bien occupé"
        hint="Facultatif : un locataire peut être saisi avant qu'un lot ne lui soit affecté."
      >
        <NativeSelect
          name="property_id"
          defaultValue={tenant?.property_id ?? defaultPropertyId ?? ""}
        >
          <option value="">— Aucun bien affecté —</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.reference} — {property.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Référence du bail">
        <Input
          name="lease_reference"
          maxLength={60}
          placeholder="BAIL-2026-014"
          defaultValue={tenant?.lease_reference}
        />
      </Field>

      <Field label={`Loyer du bail (${CURRENCY_LABEL})`}>
        <Input
          name="rent_amount"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          placeholder="150000"
          defaultValue={tenant?.rent_amount}
        />
      </Field>

      <Field label={`Charges (${CURRENCY_LABEL})`}>
        <Input
          name="charges_amount"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          placeholder="10000"
          defaultValue={tenant?.charges_amount}
        />
      </Field>

      <Field label="Début du bail">
        <Input
          name="lease_start"
          type="date"
          defaultValue={tenant?.lease_start ?? ""}
        />
      </Field>

      <Field label="Fin du bail" hint="Laissez vide si aucun terme n'est convenu.">
        <Input
          name="lease_end"
          type="date"
          defaultValue={tenant?.lease_end ?? ""}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Adresse personnelle">
          <Input
            name="address"
            maxLength={240}
            placeholder="Cocody Angré, 7e tranche"
            defaultValue={tenant?.address}
          />
        </Field>
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Observations">
          <Textarea
            name="notes"
            rows={2}
            maxLength={500}
            placeholder="Caution de deux mois versée le 3 janvier."
            defaultValue={tenant?.notes}
          />
        </Field>
      </div>
    </>
  );
}
