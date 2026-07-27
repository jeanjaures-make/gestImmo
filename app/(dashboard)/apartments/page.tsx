import { EntityForm } from "@/components/entity-form";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/kit";
import { canManage, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  APARTMENT_STATUS_LABELS,
  APARTMENT_STATUS_TONES,
  type Apartment,
  type Building,
} from "@/lib/types";
import { createApartment, updateApartment } from "./actions";
import { ApartmentFields } from "./fields";

export const metadata = { title: "Logements — ImmoOps" };

type Row = Apartment & { buildings: Pick<Building, "name"> | null };

export default async function ApartmentsPage() {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const [{ data: apartments, error }, { data: buildings }] = await Promise.all([
    supabase
      .from("apartments")
      .select("*, buildings(name)")
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    supabase.from("buildings").select("id, name").order("name"),
  ]);

  const editable = canManage(profile.role);
  const buildingOptions = buildings ?? [];

  const fields: RecordField<Row>[] = [
    {
      label: "Numéro",
      role: "title",
      value: (a) => a.number,
    },
    {
      label: "Immeuble",
      role: "subtitle",
      value: (a) => a.buildings?.name ?? "—",
    },
    {
      label: "Statut",
      role: "badge",
      value: (a) => (
        <StatusBadge tone={APARTMENT_STATUS_TONES[a.status]}>
          {APARTMENT_STATUS_LABELS[a.status]}
        </StatusBadge>
      ),
    },
    { label: "Étage", value: (a) => a.floor ?? "—" },
    { label: "Type", value: (a) => a.type ?? "—" },
    { label: "Surface", value: (a) => (a.surface ? `${a.surface} m²` : "—") },
  ];

  return (
    <>
      <PageHeader
        title="Logements"
        description="Chaque logement appartient à un immeuble et peut porter un bail."
      />

      {editable && (
        <div className="mb-6">
          {buildingOptions.length ? (
            <EntityForm
              title="Nouveau logement"
              triggerLabel="Nouveau logement"
              submitLabel="Créer le logement"
              successMessage="Logement créé."
              action={createApartment}
            >
              <ApartmentFields buildings={buildingOptions} />
            </EntityForm>
          ) : (
            <EmptyState>
              Créez d&apos;abord un immeuble : un logement doit y être rattaché.
            </EmptyState>
          )}
        </div>
      )}

      {error && (
        <EmptyState>
          Impossible de charger les logements : {error.message}
        </EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Logements"
          items={apartments ?? []}
          keyOf={(a) => a.id}
          fields={fields}
          empty="Aucun logement enregistré."
          actions={
            editable
              ? (apartment) => (
                  <RowActions
                    entityLabel="Logement"
                    editTitle={`Modifier le logement ${apartment.number}`}
                    editAction={updateApartment}
                    editFields={
                      <ApartmentFields
                        apartment={apartment}
                        buildings={buildingOptions}
                      />
                    }
                    deleteTable="apartments"
                    deleteId={apartment.id}
                    deleteDescription={`Le logement ${apartment.number} et ses baux associés seront définitivement supprimés.`}
                  />
                )
              : undefined
          }
        />
      )}
    </>
  );
}
