import Link from "next/link";

import { EntityForm } from "@/components/entity-form";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { PageHeader, StatusBadge } from "@/components/ui/kit";
import { canDelete, canIssue, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  PROPERTY_KIND_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUS_TONES,
  type Property,
} from "@/lib/types";
import { createProperty, updateProperty } from "./actions";
import { PropertyFields } from "./fields";

export const metadata = { title: "Biens — CaisseOps" };

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("properties")
    .select("*", { count: "exact" })
    .order("reference", { ascending: true })
    .range(page.from, page.to)
    .returns<Property[]>();

  const properties = data ?? [];
  const editable = canIssue(profile.role);
  const removable = canDelete(profile.role);

  const fields: RecordField<Property>[] = [
    { label: "Référence", role: "title", value: (p) => p.reference },
    { label: "Désignation", role: "subtitle", value: (p) => p.name },
    { label: "Type", value: (p) => PROPERTY_KIND_LABELS[p.kind] },
    { label: "Adresse", role: "hidden", value: (p) => p.address || "—" },
    {
      label: "Loyer",
      numeric: true,
      value: (p) => (p.rent_amount ? formatCurrency(p.rent_amount) : "—"),
    },
    {
      label: "Statut",
      value: (p) => (
        <StatusBadge tone={PROPERTY_STATUS_TONES[p.status]}>
          {PROPERTY_STATUS_LABELS[p.status]}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Biens"
        description="Les lots que vous mettez en location. Leur référence et leur adresse alimentent les quittances."
      />

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouveau bien"
            triggerLabel="Nouveau bien"
            submitLabel="Enregistrer le bien"
            successMessage="Bien enregistré."
            action={createProperty}
          >
            <PropertyFields />
          </EntityForm>
        </div>
      )}

      <RecordList
        caption="Biens en gestion"
        items={properties}
        keyOf={(p) => p.id}
        fields={fields}
        empty="Aucun bien enregistré. Commencez par en décrire un, puis rattachez-lui son locataire."
        actions={(property) => (
          <>
            <Link
              href={`/tenants?property=${property.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Locataires
            </Link>
            {editable && (
              <RowActions
                entityLabel="Bien"
                editTitle={`Modifier ${property.reference}`}
                editAction={updateProperty}
                editFields={<PropertyFields property={property} />}
                deleteTable="properties"
                deleteId={property.id}
                canDelete={removable}
                deleteDescription={`Le bien ${property.reference} sera supprimé. S'il porte encore un locataire ou une quittance, la base refusera : ces pièces resteraient sans objet.`}
              />
            )}
          </>
        )}
      />

      <Pagination
        page={page.number}
        size={page.size}
        total={count ?? 0}
        unit="biens"
      />
    </>
  );
}
