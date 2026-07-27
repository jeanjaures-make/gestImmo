import { Field, Input, NativeSelect } from "@/components/ui/kit";
import { APARTMENT_STATUS_LABELS, type Apartment } from "@/lib/types";

export function ApartmentFields({
  apartment,
  buildings,
}: {
  apartment?: Apartment;
  buildings: { id: string; name: string }[];
}) {
  return (
    <>
      <Field label="Immeuble">
        <NativeSelect
          name="building_id"
          defaultValue={apartment?.building_id}
          required
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Numéro">
        <Input
          name="number"
          placeholder="A12"
          defaultValue={apartment?.number}
          required
        />
      </Field>
      <Field label="Étage">
        <Input name="floor" placeholder="3" defaultValue={apartment?.floor ?? ""} />
      </Field>
      <Field label="Surface (m²)">
        <Input
          name="surface"
          type="number"
          step="0.01"
          min="0"
          placeholder="45"
          defaultValue={apartment?.surface ?? undefined}
        />
      </Field>
      <Field label="Type">
        <Input name="type" placeholder="T2" defaultValue={apartment?.type ?? ""} />
      </Field>
      <Field label="Statut" hint="Piloté automatiquement par les baux.">
        <NativeSelect name="status" defaultValue={apartment?.status ?? "vacant"}>
          {Object.entries(APARTMENT_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  );
}
