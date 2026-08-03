import { EntityForm } from "@/components/entity-form";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { PortalAccess } from "@/components/portal-access";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { EmptyState, PageHeader } from "@/components/ui/kit";
import { canManage, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tenant } from "@/lib/types";
import { createTenant, updateTenant } from "./actions";
import { TenantFields } from "./fields";

export const metadata = { title: "Locataires — ImmoOps" };

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);
  const supabase = await createClient();

  const [{ data: tenants, error, count }, { data: portalProfiles }] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("*", { count: "exact" })
        .order("lastname")
        .range(page.from, page.to)
        .returns<Tenant[]>(),
      // Un locataire disposant d'un compte a un profil qui le référence.
      supabase
        .from("profiles")
        .select("tenant_id")
        .not("tenant_id", "is", null)
        .returns<{ tenant_id: string }[]>(),
    ]);

  const withAccess = new Set((portalProfiles ?? []).map((p) => p.tenant_id));
  const editable = canManage(profile.role);
  const portalAvailable = isAdminConfigured();

  const fields: RecordField<Tenant>[] = [
    {
      label: "Nom",
      role: "title",
      value: (t) => `${t.firstname} ${t.lastname}`,
    },
    { label: "Téléphone", value: (t) => t.phone ?? "—" },
    { label: "E-mail", value: (t) => t.email ?? "—" },
    { label: "Pièce d'identité", value: (t) => t.identity_number ?? "—" },
    ...(editable
      ? [
          {
            label: "Espace locataire",
            className: "w-48",
            value: (t: Tenant) => (
              <PortalAccess
                tenantId={t.id}
                tenantName={`${t.firstname} ${t.lastname}`}
                email={t.email}
                hasAccess={withAccess.has(t.id)}
                available={portalAvailable}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Locataires"
        description="Les personnes auxquelles vous rattachez un bail."
        action={<ExportButton dataset="locataires" />}
      />

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouveau locataire"
            triggerLabel="Nouveau locataire"
            submitLabel="Créer le locataire"
            successMessage="Locataire créé."
            action={createTenant}
          >
            <TenantFields />
          </EntityForm>
        </div>
      )}

      {error && (
        <EmptyState>
          Impossible de charger les locataires : {error.message}
        </EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Locataires"
          items={tenants ?? []}
          keyOf={(t) => t.id}
          fields={fields}
          empty="Aucun locataire enregistré."
          actions={
            editable
              ? (tenant) => (
                  <RowActions
                    entityLabel="Locataire"
                    editTitle={`Modifier ${tenant.firstname} ${tenant.lastname}`}
                    editAction={updateTenant}
                    editFields={<TenantFields tenant={tenant} />}
                    deleteTable="tenants"
                    deleteId={tenant.id}
                    deleteDescription={`${tenant.firstname} ${tenant.lastname} et tous ses baux, échéances comprises, seront définitivement supprimés.`}
                  />
                )
              : undefined
          }
        />
      )}

      {!error && (
        <Pagination
          page={page.number}
          size={page.size}
          total={count ?? 0}
          unit="locataires"
        />
      )}
    </>
  );
}
