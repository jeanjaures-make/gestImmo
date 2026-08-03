import { Field, Input } from "@/components/ui/kit";
import { CURRENCY_LABEL } from "@/lib/money";
import type { Building } from "@/lib/types";

/** Champs partagés par la création et l'édition d'un immeuble. */
export function BuildingFields({ building }: { building?: Building }) {
  return (
    <>
      <Field label="Nom">
        <Input
          name="name"
          placeholder="Résidence des Tilleuls"
          defaultValue={building?.name}
          required
        />
      </Field>
      <Field label="Adresse">
        <Input
          name="address"
          placeholder="12 rue Victor Hugo"
          defaultValue={building?.address}
          required
        />
      </Field>
      <Field label="Ville">
        <Input
          name="city"
          placeholder="Lyon"
          defaultValue={building?.city}
          required
        />
      </Field>
      <Field label="Pays">
        <Input name="country" defaultValue={building?.country ?? "France"} />
      </Field>
      <Field
        label={`Valeur estimée (${CURRENCY_LABEL})`}
        hint="Alimente le patrimoine et le rendement."
      >
        <Input
          name="estimated_value"
          type="number"
          step="1000"
          min="0"
          placeholder="850000"
          defaultValue={building?.estimated_value ?? undefined}
        />
      </Field>
    </>
  );
}
