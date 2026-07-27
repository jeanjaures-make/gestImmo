import { Field, Input, NativeSelect, Textarea } from "@/components/ui/kit";
import {
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  type MaintenancePriority,
  type MaintenanceStatus,
} from "@/lib/types";

export type MaintenanceRecord = {
  id: string;
  building_id: string;
  apartment_id: string | null;
  title: string;
  description: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
};

export function MaintenanceFields({
  intervention,
  buildings,
  apartments,
}: {
  intervention?: MaintenanceRecord;
  buildings: { id: string; name: string }[];
  apartments: { id: string; number: string }[];
}) {
  return (
    <>
      <Field label="Immeuble">
        <NativeSelect
          name="building_id"
          defaultValue={intervention?.building_id}
          required
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Logement" hint="Facultatif : parties communes.">
        <NativeSelect
          name="apartment_id"
          defaultValue={intervention?.apartment_id ?? ""}
        >
          <option value="">— Aucun —</option>
          {apartments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.number}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Intitulé">
        <Input
          name="title"
          placeholder="Fuite chauffe-eau"
          defaultValue={intervention?.title}
          required
        />
      </Field>
      <Field label="Priorité">
        <NativeSelect
          name="priority"
          defaultValue={intervention?.priority ?? "medium"}
        >
          {Object.entries(MAINTENANCE_PRIORITY_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Statut">
        <NativeSelect name="status" defaultValue={intervention?.status ?? "open"}>
          {Object.entries(MAINTENANCE_STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description">
          <Textarea
            name="description"
            rows={3}
            placeholder="Détails, accès, coordonnées du prestataire…"
            defaultValue={intervention?.description ?? ""}
          />
        </Field>
      </div>
    </>
  );
}
