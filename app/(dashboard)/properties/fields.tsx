import { Field, Input, NativeSelect, Textarea } from "@/components/ui/kit";
import {
  CURRENCY_LABEL,
  PROPERTY_KIND_LABELS,
  type Property,
} from "@/lib/types";

/**
 * Les champs d'un bien.
 *
 * Partagés par la création et l'édition, comme pour les pièces de caisse :
 * une divergence entre les deux formulaires donnerait un champ qu'on peut
 * renseigner mais plus corriger.
 *
 * Le STATUT n'y figure pas. Il suit les locataires rattachés, tenu à jour
 * par un déclencheur : le proposer à la saisie inviterait à contredire la
 * base, qui reprendrait la main au prochain mouvement de bail.
 */
export function PropertyFields({ property }: { property?: Property }) {
  return (
    <>
      <Field
        label="Référence"
        hint="La vôtre : « APP-A3 », « VILLA-2 ». Elle doit être unique chez vous."
      >
        <Input
          name="reference"
          required
          maxLength={40}
          placeholder="APP-A3"
          defaultValue={property?.reference}
        />
      </Field>

      <Field label="Désignation">
        <Input
          name="name"
          required
          maxLength={160}
          placeholder="Appartement 3 pièces, 2e étage"
          defaultValue={property?.name}
        />
      </Field>

      <Field label="Type de bien">
        <NativeSelect name="kind" defaultValue={property?.kind ?? "appartement"}>
          {Object.entries(PROPERTY_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Adresse" hint="Telle qu'elle s'imprimera sur la quittance.">
          <Input
            name="address"
            maxLength={240}
            placeholder="Koumassi Remblais, près de l'école la Rochelle"
            defaultValue={property?.address}
          />
        </Field>
      </div>

      <Field
        label="Propriétaire / bailleur"
        hint="À renseigner si vous gérez pour un tiers. Sinon, votre raison sociale sert."
      >
        <Input
          name="owner_name"
          maxLength={160}
          placeholder="M. Kouassi Bernard"
          defaultValue={property?.owner_name}
        />
      </Field>

      <Field label={`Loyer mensuel (${CURRENCY_LABEL})`}>
        <Input
          name="rent_amount"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          placeholder="150000"
          defaultValue={property?.rent_amount}
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
          defaultValue={property?.charges_amount}
        />
      </Field>

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Description" hint="Superficie, équipements, particularités.">
          <Textarea
            name="description"
            rows={2}
            maxLength={500}
            placeholder="3 pièces, 78 m², balcon, place de parking"
            defaultValue={property?.description}
          />
        </Field>
      </div>
    </>
  );
}
