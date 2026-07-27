import { FileDown, Search } from "lucide-react";

import { DocumentActions } from "@/components/document-actions";
import {
  DocumentUploader,
  type OwnerOption,
} from "@/components/document-uploader";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  StatusBadge,
} from "@/components/ui/kit";
import { canManage, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { formatDate, type DocumentOwnerType } from "@/lib/types";

export const metadata = { title: "Documents — ImmoOps" };

type DocumentRow = {
  id: string;
  owner_type: DocumentOwnerType;
  owner_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: "private" | "organization";
  created_at: string;
};

const OWNER_LABELS: Record<DocumentOwnerType, string> = {
  organization: "Organisation",
  building: "Immeuble",
  apartment: "Logement",
  tenant: "Locataire",
  lease: "Bail",
  expense: "Dépense",
};

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const { profile } = await requireSession();
  const { q = "", type = "", page: pageParam } = await searchParams;
  const page = readPage(pageParam);
  const supabase = await createClient();

  let query = supabase
    .from("documents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page.from, page.to);

  if (q.trim()) query = query.ilike("file_name", `%${q.trim()}%`);
  if (type) query = query.eq("owner_type", type);

  const [
    { data: documents, error, count },
    { data: buildings },
    { data: apartments },
    { data: tenants },
    { data: leases },
  ] = await Promise.all([
    query.returns<DocumentRow[]>(),
    supabase.from("buildings").select("id, name").order("name"),
    supabase
      .from("apartments")
      .select("id, number, buildings(name)")
      .order("number")
      .returns<{ id: string; number: string; buildings: { name: string } | null }[]>(),
    supabase
      .from("tenants")
      .select("id, firstname, lastname")
      .order("lastname")
      .returns<{ id: string; firstname: string; lastname: string }[]>(),
    supabase
      .from("leases")
      .select("id, tenants(firstname, lastname), apartments(number)")
      .returns<
        {
          id: string;
          tenants: { firstname: string; lastname: string } | null;
          apartments: { number: string } | null;
        }[]
      >(),
  ]);

  const targets: Record<
    Exclude<DocumentOwnerType, "organization" | "expense">,
    OwnerOption[]
  > = {
    building: (buildings ?? []).map((b) => ({ id: b.id, label: b.name })),
    apartment: (apartments ?? []).map((a) => ({
      id: a.id,
      label: a.buildings?.name ? `${a.buildings.name} — ${a.number}` : a.number,
    })),
    tenant: (tenants ?? []).map((t) => ({
      id: t.id,
      label: `${t.firstname} ${t.lastname}`,
    })),
    lease: (leases ?? []).map((l) => ({
      id: l.id,
      label: `${l.tenants ? `${l.tenants.firstname} ${l.tenants.lastname}` : "Bail"}${
        l.apartments ? ` — ${l.apartments.number}` : ""
      }`,
    })),
  };

  // Un seul index pour retrouver le libellé d'un rattachement, quel que
  // soit son type.
  const labelById = new Map<string, string>();
  for (const list of Object.values(targets)) {
    for (const option of list) labelById.set(option.id, option.label);
  }

  const editable = canManage(profile.role);

  const fields: RecordField<DocumentRow>[] = [
    { label: "Nom", role: "title", value: (d) => d.file_name },
    {
      label: "Élément",
      role: "subtitle",
      value: (d) =>
        d.owner_type === "organization"
          ? "Organisation"
          : (labelById.get(d.owner_id) ?? "Élément supprimé"),
    },
    {
      label: "Rattaché à",
      role: "badge",
      value: (d) => (
        <StatusBadge tone="neutral">{OWNER_LABELS[d.owner_type]}</StatusBadge>
      ),
    },
    { label: "Taille", value: (d) => formatSize(d.size_bytes) },
    {
      label: "Visibilité",
      value: (d) => (
        <StatusBadge tone={d.visibility === "private" ? "warning" : "neutral"}>
          {d.visibility === "private" ? "Restreint" : "Organisation"}
        </StatusBadge>
      ),
    },
    { label: "Déposé le", value: (d) => formatDate(d.created_at) },
  ];
  const filtering = Boolean(q.trim() || type);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Baux signés, quittances, factures et pièces d'identité, dans un stockage privé."
      />

      {editable && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="font-heading mb-4 font-medium">Déposer un document</h2>
            <DocumentUploader targets={targets} />
          </CardContent>
        </Card>
      )}

      {/* Formulaire GET : filtrable sans JavaScript, et l'URL reste partageable. */}
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label
            htmlFor="documents-search"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Rechercher
          </label>
          <Input
            id="documents-search"
            name="q"
            defaultValue={q}
            placeholder="Nom du fichier…"
          />
        </div>
        <div className="w-48">
          <label
            htmlFor="documents-type"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Rattachement
          </label>
          <NativeSelect id="documents-type" name="type" defaultValue={type}>
            <option value="">Tous</option>
            {Object.entries(OWNER_LABELS).map(([value, label]) => (
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
          <Button type="button" size="lg" variant="ghost" render={<a href="/documents" />}>
            Réinitialiser
          </Button>
        )}
      </form>

      {error && (
        <EmptyState>
          Impossible de charger les documents : {error.message}
        </EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Documents"
          items={documents ?? []}
          keyOf={(d) => d.id}
          fields={fields}
          empty={
            filtering
              ? "Aucun document ne correspond à ces critères."
              : "Aucun document déposé pour le moment."
          }
          actions={(doc) => (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Télécharger ${doc.file_name}`}
                render={
                  <a
                    href={`/documents/download?path=${encodeURIComponent(doc.storage_path)}`}
                  />
                }
              >
                <FileDown className="size-4" />
              </Button>
              {editable && (
                <DocumentActions id={doc.id} fileName={doc.file_name} />
              )}
            </div>
          )}
        />
      )}

      {!error && (
        <Pagination
          page={page.number}
          size={page.size}
          total={count ?? 0}
          unit="documents"
        />
      )}
    </>
  );
}
