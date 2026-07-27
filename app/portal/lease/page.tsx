import { MapPin } from "lucide-react";

import { Card, CardContent, EmptyState, StatusBadge } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import { activeLease, getTenantLeases } from "@/lib/portal";
import {
  formatCurrency,
  formatDate,
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
} from "@/lib/types";

export const metadata = { title: "Mon bail — ImmoOps" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function PortalLeasePage() {
  await requireTenantSession();
  const leases = await getTenantLeases();
  const lease = activeLease(leases);

  if (!lease) {
    return (
      <EmptyState>
        Aucun bail n&apos;est rattaché à votre compte.
      </EmptyState>
    );
  }

  const past = leases.filter((l) => l.id !== lease.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold">Mon bail</h1>
        <StatusBadge tone={LEASE_STATUS_TONES[lease.status]}>
          {LEASE_STATUS_LABELS[lease.status]}
        </StatusBadge>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <p className="font-heading font-semibold">
            {lease.apartments?.buildings?.name ?? "Logement"}
            {lease.apartments?.number ? ` · ${lease.apartments.number}` : ""}
          </p>
          {lease.apartments?.buildings && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {lease.apartments.buildings.address},{" "}
                {lease.apartments.buildings.city}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">
            Conditions financières
          </h2>
          <dl>
            <Row label="Loyer hors charges" value={formatCurrency(lease.rent)} />
            <Row label="Charges" value={formatCurrency(lease.charges)} />
            <Row
              label="Total mensuel"
              value={formatCurrency(Number(lease.rent) + Number(lease.charges))}
            />
            <Row
              label="Dépôt de garantie"
              value={formatCurrency(lease.deposit)}
            />
          </dl>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">
            Durée
          </h2>
          <dl>
            <Row label="Date d'entrée" value={formatDate(lease.start_date)} />
            <Row
              label="Date de fin"
              value={lease.end_date ? formatDate(lease.end_date) : "Indéterminée"}
            />
          </dl>
        </CardContent>
      </Card>

      {lease.apartments && (
        <Card className="gap-0 py-0">
          <CardContent className="p-4">
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">
              Le logement
            </h2>
            <dl>
              <Row label="Numéro" value={lease.apartments.number} />
              <Row label="Étage" value={lease.apartments.floor ?? "—"} />
              <Row label="Type" value={lease.apartments.type ?? "—"} />
              <Row
                label="Surface"
                value={
                  lease.apartments.surface
                    ? `${lease.apartments.surface} m²`
                    : "—"
                }
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Baux précédents</h2>
          <div className="flex flex-col gap-2">
            {past.map((old) => (
              <Card key={old.id} className="gap-0 py-0">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {old.apartments?.buildings?.name ?? "Logement"}
                      {old.apartments?.number ? ` · ${old.apartments.number}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(old.start_date)} →{" "}
                      {old.end_date ? formatDate(old.end_date) : "—"}
                    </p>
                  </div>
                  <StatusBadge tone={LEASE_STATUS_TONES[old.status]}>
                    {LEASE_STATUS_LABELS[old.status]}
                  </StatusBadge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
