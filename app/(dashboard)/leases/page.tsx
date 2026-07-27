import { CloseLease } from "@/components/close-lease";
import { EntityForm } from "@/components/entity-form";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/kit";
import { canManage, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  formatDate,
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
  type Lease,
} from "@/lib/types";
import { createLease, updateLease } from "./actions";
import { LeaseFields, type ApartmentOption, type TenantOption } from "./fields";

export const metadata = { title: "Baux — ImmoOps" };

type Row = Lease & {
  tenants: { firstname: string; lastname: string } | null;
  apartments: { number: string; buildings: { name: string } | null } | null;
};

type ApartmentRow = ApartmentOption & { status: string };

export default async function LeasesPage() {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const [{ data: leases, error }, { data: tenants }, { data: apartments }] =
    await Promise.all([
      supabase
        .from("leases")
        .select(
          "*, tenants(firstname, lastname), apartments(number, buildings(name))",
        )
        .order("start_date", { ascending: false })
        .returns<Row[]>(),
      supabase
        .from("tenants")
        .select("id, firstname, lastname")
        .order("lastname")
        .returns<TenantOption[]>(),
      supabase
        .from("apartments")
        .select("id, number, status, buildings(name)")
        .order("number")
        .returns<ApartmentRow[]>(),
    ]);

  const editable = canManage(profile.role);
  const allTenants = tenants ?? [];
  const allApartments = apartments ?? [];

  // Un logement déjà occupé porte un bail actif : le proposer à la création
  // mènerait droit à une violation de l'index unique partiel.
  const available = allApartments.filter((a) => a.status !== "occupied");
  const canCreate = Boolean(allTenants.length && available.length);

  const nameOf = (lease: Row) =>
    lease.tenants
      ? `${lease.tenants.firstname} ${lease.tenants.lastname}`
      : "—";

  const fields: RecordField<Row>[] = [
    { label: "Locataire", role: "title", value: nameOf },
    {
      label: "Logement",
      role: "subtitle",
      value: (l) =>
        `${l.apartments?.buildings?.name ? `${l.apartments.buildings.name} — ` : ""}${l.apartments?.number ?? "—"}`,
    },
    {
      label: "État",
      role: "badge",
      value: (l) => (
        <StatusBadge tone={LEASE_STATUS_TONES[l.status]}>
          {LEASE_STATUS_LABELS[l.status]}
        </StatusBadge>
      ),
    },
    { label: "Loyer", numeric: true, value: (l) => formatCurrency(l.rent) },
    { label: "Charges", numeric: true, value: (l) => formatCurrency(l.charges) },
    { label: "Début", value: (l) => formatDate(l.start_date) },
    { label: "Fin", value: (l) => formatDate(l.end_date) },
  ];

  return (
    <>
      <PageHeader
        title="Baux"
        description="Le contrat qui lie un locataire à un logement."
      />

      {editable && (
        <div className="mb-6">
          {canCreate ? (
            <EntityForm
              title="Nouveau bail"
              triggerLabel="Nouveau bail"
              submitLabel="Créer le bail"
              successMessage="Bail créé."
              action={createLease}
            >
              <LeaseFields tenants={allTenants} apartments={available} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  name="generate_schedule"
                  defaultChecked
                  className="size-4 accent-[var(--primary)]"
                />
                Générer les 12 prochaines échéances de loyer
              </label>
            </EntityForm>
          ) : (
            <EmptyState>
              {allTenants.length
                ? "Aucun logement libre : tous vos logements ont déjà un bail actif."
                : "Il faut au moins un locataire et un logement libre pour créer un bail."}
            </EmptyState>
          )}
        </div>
      )}

      {error && (
        <EmptyState>Impossible de charger les baux : {error.message}</EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Baux"
          items={leases ?? []}
          keyOf={(l) => l.id}
          fields={fields}
          empty="Aucun bail enregistré."
          actions={
            editable
              ? (lease) => (
                  <div className="flex items-center justify-end gap-2">
                    {lease.status === "active" && (
                      <CloseLease leaseId={lease.id} />
                    )}
                    <RowActions
                      entityLabel="Bail"
                      editTitle={`Modifier le bail de ${nameOf(lease)}`}
                      editAction={updateLease}
                      editFields={
                        <LeaseFields
                          lease={lease}
                          tenants={allTenants}
                          apartments={allApartments}
                        />
                      }
                      deleteTable="leases"
                      deleteId={lease.id}
                      deleteDescription={`Le bail de ${nameOf(lease)} et toutes ses échéances de loyer seront définitivement supprimés.`}
                    />
                  </div>
                )
              : undefined
          }
        />
      )}
    </>
  );
}
