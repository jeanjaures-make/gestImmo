import Link from "next/link";
import { Printer, Search } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import {
  Button,
  Input,
  NativeSelect,
  PageHeader,
  StatusBadge,
} from "@/components/ui/kit";
import { canIssue, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  formatDate,
  RENT_RECEIPT_STATUS_LABELS,
  RENT_RECEIPT_STATUS_TONES,
  type Property,
  type RentReceipt,
  type Tenant,
} from "@/lib/types";
import { createRentReceipt } from "./actions";
import { RentReceiptFields } from "./fields";

export const metadata = { title: "Quittances — CaisseOps" };

export default async function RentReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    tenant?: string;
    property?: string;
    year?: string;
    status?: string;
  }>;
}) {
  const { profile, organization } = await requireSession();
  const {
    page: pageParam,
    q = "",
    tenant = "",
    property = "",
    year = "",
    status = "",
  } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();

  let query = supabase.from("rent_receipts").select("*", { count: "exact" });

  // Le numéro ou le nom du locataire : les deux entrées qu'on a en tête
  // quand on cherche une quittance. Le nom est celui FIGÉ sur la pièce,
  // ce qui reste juste même si la fiche du locataire a changé depuis.
  const needle = q.trim();
  if (needle) {
    const escaped = needle.replace(/[%,()]/g, " ");
    query = query.or(`number.ilike.%${escaped}%,tenant_name.ilike.%${escaped}%`);
  }
  if (tenant) query = query.eq("tenant_id", tenant);
  if (property) query = query.eq("property_id", property);
  if (status) query = query.eq("status", status);
  if (/^\d{4}$/.test(year)) {
    query = query.gte("issued_on", `${year}-01-01`).lte("issued_on", `${year}-12-31`);
  }

  const [{ data: propertyRows }, { data: tenantRows }, listing] =
    await Promise.all([
      supabase
        .from("properties")
        .select("*")
        .order("reference", { ascending: true })
        .returns<Property[]>(),
      supabase
        .from("tenants")
        .select("*")
        .order("full_name", { ascending: true })
        .returns<Tenant[]>(),
      query
        .order("issued_on", { ascending: false })
        .order("number", { ascending: false })
        .range(page.from, page.to)
        .returns<RentReceipt[]>(),
    ]);

  const properties = propertyRows ?? [];
  const tenants = tenantRows ?? [];
  const receipts = listing.data ?? [];
  const editable = canIssue(profile.role);
  const filtering = Boolean(q || tenant || property || year || status);

  // Les années réellement présentes plutôt qu'une plage arbitraire : une
  // liste qui propose 2019 à une régie ouverte en 2026 fait douter.
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const fields: RecordField<RentReceipt>[] = [
    {
      label: "Numéro",
      role: "title",
      value: (r) => (
        <Link href={`/rent-receipts/${r.id}`} className="hover:underline">
          {r.number}
        </Link>
      ),
    },
    { label: "Locataire", role: "subtitle", value: (r) => r.tenant_name },
    { label: "Bien", role: "hidden", value: (r) => r.property_label || "—" },
    {
      label: "Période",
      value: (r) => r.period_label || formatDate(r.period_start),
    },
    { label: "Émise le", value: (r) => formatDate(r.issued_on) },
    {
      label: "Montant",
      numeric: true,
      value: (r) => formatCurrency(r.total_amount),
    },
    {
      label: "Statut",
      value: (r) => (
        <StatusBadge tone={RENT_RECEIPT_STATUS_TONES[r.status]}>
          {RENT_RECEIPT_STATUS_LABELS[r.status]}
        </StatusBadge>
      ),
    },
  ];

  const managerName =
    `${profile.firstname} ${profile.lastname}`.trim() || undefined;

  return (
    <>
      <PageHeader
        title="Quittances de loyer"
        description="La preuve remise au locataire. Chaque quittance porte votre en-tête et un numéro continu."
      />

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouvelle quittance"
            triggerLabel="Nouvelle quittance"
            submitLabel="Enregistrer la quittance"
            successMessage="Quittance enregistrée."
            action={createRentReceipt}
          >
            <RentReceiptFields
              properties={properties}
              tenants={tenants}
              defaultManagerName={managerName}
              defaultLandlordName={organization.name}
            />
          </EntityForm>
        </div>
      )}

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label
            htmlFor="ql-q"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Numéro ou locataire
          </label>
          <Input id="ql-q" name="q" defaultValue={q} placeholder="QL-2026-0007" />
        </div>

        <div className="w-52">
          <label
            htmlFor="ql-tenant"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Locataire
          </label>
          <NativeSelect id="ql-tenant" name="tenant" defaultValue={tenant}>
            <option value="">Tous</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="w-52">
          <label
            htmlFor="ql-property"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Bien
          </label>
          <NativeSelect id="ql-property" name="property" defaultValue={property}>
            <option value="">Tous</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="w-32">
          <label
            htmlFor="ql-year"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Année
          </label>
          <NativeSelect id="ql-year" name="year" defaultValue={year}>
            <option value="">Toutes</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="w-40">
          <label
            htmlFor="ql-status"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Statut
          </label>
          <NativeSelect id="ql-status" name="status" defaultValue={status}>
            <option value="">Tous</option>
            {Object.entries(RENT_RECEIPT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <Button type="submit" size="lg" variant="outline">
          <Search className="size-4" />
          Filtrer
        </Button>
        {filtering && (
          <Button
            type="button"
            size="lg"
            variant="ghost"
            render={<Link href="/rent-receipts" />}
          >
            Réinitialiser
          </Button>
        )}
      </form>

      <RecordList
        caption="Quittances émises"
        items={receipts}
        keyOf={(r) => r.id}
        fields={fields}
        empty={
          filtering
            ? "Aucune quittance ne correspond à ces critères."
            : "Aucune quittance émise. Enregistrez un bien et son locataire, puis émettez la première."
        }
        actions={(receipt) => (
          <Link
            href={`/rent-receipts/${receipt.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Printer className="size-3.5" />
            Ouvrir
          </Link>
        )}
      />

      <Pagination
        page={page.number}
        size={page.size}
        total={listing.count ?? 0}
        unit="quittances"
      />
    </>
  );
}
