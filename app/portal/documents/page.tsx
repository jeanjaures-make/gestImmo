import { FileDown, FileText } from "lucide-react";

import { Pagination } from "@/components/pagination";
import { Card, CardContent, EmptyState, StatusBadge } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/types";

export const metadata = { title: "Mes documents — ImmoOps" };

type Doc = {
  id: string;
  owner_type: "tenant" | "lease";
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
};

const OWNER_LABELS: Record<Doc["owner_type"], string> = {
  tenant: "Personnel",
  lease: "Bail",
};

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default async function PortalDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireTenantSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();
  // Le RLS ne remonte que les pièces rattachées à sa fiche ou à ses baux :
  // les documents de l'immeuble ou de l'organisation restent invisibles.
  const { data: documents, count } = await supabase
    .from("documents")
    .select("id, owner_type, file_name, storage_path, size_bytes, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(page.from, page.to)
    .returns<Doc[]>();

  const list = documents ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Mes documents</h1>

      {!list.length && (
        <EmptyState>
          Aucun document partagé pour l&apos;instant. Votre gestionnaire y
          déposera votre bail et vos pièces justificatives.
        </EmptyState>
      )}

      <div className="flex flex-col gap-2">
        {list.map((doc) => (
          <Card key={doc.id} className="gap-0 py-0">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{doc.file_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(doc.created_at)}
                    {formatSize(doc.size_bytes) &&
                      ` · ${formatSize(doc.size_bytes)}`}
                  </p>
                </div>
                <StatusBadge tone="neutral">
                  {OWNER_LABELS[doc.owner_type]}
                </StatusBadge>
              </div>

              <a
                href={`/documents/download?path=${encodeURIComponent(doc.storage_path)}`}
                className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium active:bg-muted"
              >
                <FileDown className="size-4" />
                Télécharger
              </a>
            </CardContent>
          </Card>
        ))}
      </div>

      <Pagination
        page={page.number}
        size={page.size}
        total={count ?? 0}
        unit="documents"
      />
    </div>
  );
}
