import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { PageHeader } from "@/components/ui/kit";
import { canDelete, canIssue, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, type Property, type Tenant } from "@/lib/types";
import { createTenant, updateTenant } from "./actions";
import { TenantFields } from "./fields";

export const metadata = { title: "Locataires — CaisseOps" };

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; property?: string }>;
}) {
  const { profile } = await requireSession();
  const { page: pageParam, property: propertyFilter } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();

  // Les biens alimentent le sélecteur du formulaire ET la colonne « Bien ».
  // Une seule lecture pour les deux : la liste tient largement en mémoire,
  // et une jointure PostgREST rendrait le typage bien plus lourd.
  const [{ data: propertyRows }, listing] = await Promise.all([
    supabase
      .from("properties")
      .select("*")
      .order("reference", { ascending: true })
      .returns<Property[]>(),
    (propertyFilter
      ? supabase
          .from("tenants")
          .select("*", { count: "exact" })
          .eq("property_id", propertyFilter)
      : supabase.from("tenants").select("*", { count: "exact" })
    )
      .order("full_name", { ascending: true })
      .range(page.from, page.to)
      .returns<Tenant[]>(),
  ]);

  const properties = propertyRows ?? [];
  const tenants = listing.data ?? [];
  const byId = new Map(properties.map((p) => [p.id, p]));
  const focused = propertyFilter ? byId.get(propertyFilter) : undefined;

  const editable = canIssue(profile.role);
  const removable = canDelete(profile.role);

  const fields: RecordField<Tenant>[] = [
    { label: "Locataire", role: "title", value: (t) => t.full_name },
    {
      label: "Bien",
      role: "subtitle",
      value: (t) => {
        const property = t.property_id ? byId.get(t.property_id) : undefined;
        return property ? `${property.reference} — ${property.name}` : "Sans bien";
      },
    },
    { label: "Téléphone", value: (t) => t.phone || "—" },
    {
      label: "Loyer",
      numeric: true,
      value: (t) => (t.rent_amount ? formatCurrency(t.rent_amount) : "—"),
    },
    {
      label: "Bail",
      role: "hidden",
      value: (t) =>
        t.lease_start
          ? `du ${formatDate(t.lease_start)}${t.lease_end ? ` au ${formatDate(t.lease_end)}` : ""}`
          : "—",
    },
  ];

  return (
    <>
      <PageHeader
        title="Locataires"
        description={
          focused
            ? `Locataires du bien ${focused.reference} — ${focused.name}.`
            : "Qui occupe quoi, à quel loyer, et depuis quand. C'est d'ici que part une quittance."
        }
      />

      {focused && (
        <p className="mb-4 text-sm print:hidden">
          <Link href="/tenants" className="text-primary hover:underline">
            Voir tous les locataires
          </Link>
        </p>
      )}

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouveau locataire"
            triggerLabel="Nouveau locataire"
            submitLabel="Enregistrer le locataire"
            successMessage="Locataire enregistré."
            action={createTenant}
          >
            <TenantFields
              properties={properties}
              defaultPropertyId={propertyFilter}
            />
          </EntityForm>
        </div>
      )}

      <RecordList
        caption="Locataires"
        items={tenants}
        keyOf={(t) => t.id}
        fields={fields}
        empty={
          properties.length === 0
            ? "Enregistrez d'abord un bien : c'est à lui qu'un locataire se rattache."
            : "Aucun locataire pour l'instant."
        }
        actions={(tenant) => (
          <>
            <Link
              href={`/rent-receipts?tenant=${tenant.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ReceiptText className="size-3.5" />
              Quittances
            </Link>
            {editable && (
              <RowActions
                entityLabel="Locataire"
                editTitle={`Modifier ${tenant.full_name}`}
                editAction={updateTenant}
                editFields={
                  <TenantFields tenant={tenant} properties={properties} />
                }
                deleteTable="tenants"
                deleteId={tenant.id}
                canDelete={removable}
                deleteDescription={`${tenant.full_name} sera supprimé de vos locataires. Ses quittances déjà émises, elles, restent : elles ont été remises.`}
              />
            )}
          </>
        )}
      />

      <Pagination
        page={page.number}
        size={page.size}
        total={listing.count ?? 0}
        unit="locataires"
      />
    </>
  );
}
