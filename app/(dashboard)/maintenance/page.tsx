import { EntityForm } from "@/components/entity-form";
import { MaintenanceStatusSelect } from "@/components/maintenance-status";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/kit";
import { canManage, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  formatDate,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_PRIORITY_TONES,
  MAINTENANCE_STATUS_LABELS,
} from "@/lib/types";
import { createMaintenance, updateMaintenance } from "./actions";
import { MaintenanceFields, type MaintenanceRecord } from "./fields";

export const metadata = { title: "Interventions — ImmoOps" };

type Row = MaintenanceRecord & {
  created_at: string;
  buildings: { name: string } | null;
  apartments: { number: string } | null;
};

export default async function MaintenancePage() {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const [
    { data: interventions, error },
    { data: buildings },
    { data: apartments },
  ] = await Promise.all([
    supabase
      .from("maintenance")
      .select(
        "id, building_id, apartment_id, title, description, priority, status, created_at, buildings(name), apartments(number)",
      )
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<Row[]>(),
    supabase.from("buildings").select("id, name").order("name"),
    supabase
      .from("apartments")
      .select("id, number")
      .order("number")
      .returns<{ id: string; number: string }[]>(),
  ]);

  const editable = canManage(profile.role);
  const buildingOptions = buildings ?? [];
  const apartmentOptions = apartments ?? [];
  const openCount =
    interventions?.filter(
      (i) => i.status === "open" || i.status === "in_progress",
    ).length ?? 0;

  const fields: RecordField<Row>[] = [
    { label: "Intitulé", role: "title", value: (i) => i.title },
    {
      label: "Localisation",
      role: "subtitle",
      value: (i) =>
        `${i.buildings?.name ?? "—"} · ${i.apartments?.number ?? "Communs"}`,
    },
    {
      label: "Priorité",
      role: "badge",
      value: (i) => (
        <StatusBadge tone={MAINTENANCE_PRIORITY_TONES[i.priority]}>
          {MAINTENANCE_PRIORITY_LABELS[i.priority]}
        </StatusBadge>
      ),
    },
    {
      label: "Statut",
      className: "w-44",
      value: (i) =>
        editable ? (
          <MaintenanceStatusSelect id={i.id} status={i.status} />
        ) : (
          <StatusBadge tone="neutral">
            {MAINTENANCE_STATUS_LABELS[i.status]}
          </StatusBadge>
        ),
    },
    { label: "Ouverte le", value: (i) => formatDate(i.created_at) },
  ];

  return (
    <>
      <PageHeader
        title="Interventions"
        description={
          openCount > 0
            ? `${openCount} intervention(s) en cours ou à traiter.`
            : "Suivi de la maintenance du parc."
        }
      />

      {editable && (
        <div className="mb-6">
          {buildingOptions.length ? (
            <EntityForm
              title="Nouvelle intervention"
              triggerLabel="Nouvelle intervention"
              submitLabel="Créer l'intervention"
              successMessage="Intervention créée."
              action={createMaintenance}
            >
              <MaintenanceFields
                buildings={buildingOptions}
                apartments={apartmentOptions}
              />
            </EntityForm>
          ) : (
            <EmptyState>
              Créez d&apos;abord un immeuble : une intervention y est rattachée.
            </EmptyState>
          )}
        </div>
      )}

      {error && (
        <EmptyState>
          Impossible de charger les interventions : {error.message}
        </EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Interventions"
          items={interventions ?? []}
          keyOf={(i) => i.id}
          fields={fields}
          empty="Aucune intervention enregistrée."
          actions={
            editable
              ? (item) => (
                  <RowActions
                    entityLabel="Intervention"
                    editTitle={`Modifier « ${item.title} »`}
                    editAction={updateMaintenance}
                    editFields={
                      <MaintenanceFields
                        intervention={item}
                        buildings={buildingOptions}
                        apartments={apartmentOptions}
                      />
                    }
                    deleteTable="maintenance"
                    deleteId={item.id}
                    deleteDescription={`L'intervention « ${item.title} » sera définitivement supprimée.`}
                  />
                )
              : undefined
          }
        />
      )}
    </>
  );
}
