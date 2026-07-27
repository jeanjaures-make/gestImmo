import Link from "next/link";
import { Plus, Wrench } from "lucide-react";

import { Pagination } from "@/components/pagination";
import { Card, CardContent, EmptyState, StatusBadge } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  formatDate,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_PRIORITY_TONES,
  MAINTENANCE_STATUS_LABELS,
  type MaintenancePriority,
  type MaintenanceStatus,
} from "@/lib/types";

export const metadata = { title: "Incidents — ImmoOps" };

type Incident = {
  id: string;
  title: string;
  description: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  created_at: string;
  resolved_at: string | null;
};

const OPEN: MaintenanceStatus[] = ["open", "in_progress"];

export default async function PortalIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireTenantSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();
  const { data: incidents } = await supabase
    .from("maintenance")
    .select("id, title, description, priority, status, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .returns<Incident[]>();

  const list = incidents ?? [];
  const ongoing = list.filter((i) => OPEN.includes(i.status));
  const closed = list.filter((i) => !OPEN.includes(i.status));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Incidents</h1>

      <Link
        href="/portal/incidents/new"
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground active:opacity-90"
      >
        <Plus className="size-4" />
        Déclarer un incident
      </Link>

      {!list.length && (
        <EmptyState>
          Aucun incident déclaré. Tant mieux.
        </EmptyState>
      )}

      {ongoing.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">En cours</h2>
          <div className="flex flex-col gap-2">
            {ongoing.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </section>
      )}

      {/* Seul l'historique est paginé. Les incidents en cours restent tous
          visibles : ce sont eux qui appellent une action, les répartir sur
          plusieurs pages reviendrait à en cacher. */}
      {closed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Historique</h2>
          <div className="flex flex-col gap-2">
            {closed.slice(page.from, page.to + 1).map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
          <Pagination
            page={page.number}
            size={page.size}
            total={closed.length}
            unit="incidents clos"
          />
        </section>
      )}
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{incident.title}</p>
            {incident.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {incident.description}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Déclarée le {formatDate(incident.created_at)}
              {incident.resolved_at &&
                ` · résolue le ${formatDate(incident.resolved_at)}`}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={MAINTENANCE_PRIORITY_TONES[incident.priority]}>
            {MAINTENANCE_PRIORITY_LABELS[incident.priority]}
          </StatusBadge>
          <StatusBadge
            tone={
              incident.status === "resolved"
                ? "success"
                : incident.status === "in_progress"
                  ? "info"
                  : incident.status === "cancelled"
                    ? "neutral"
                    : "warning"
            }
          >
            {MAINTENANCE_STATUS_LABELS[incident.status]}
          </StatusBadge>
        </div>
      </CardContent>
    </Card>
  );
}
