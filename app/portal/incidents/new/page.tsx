import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { IncidentForm } from "@/components/incident-form";
import { Card, CardContent } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import { activeLease, getTenantLeases } from "@/lib/portal";

export const metadata = { title: "Déclarer un incident — ImmoOps" };

export default async function NewIncidentPage() {
  await requireTenantSession();
  const lease = activeLease(await getTenantLeases());

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/portal/incidents"
        className="flex min-h-11 items-center gap-1 text-sm text-primary"
      >
        <ChevronLeft className="size-4" />
        Retour
      </Link>

      <h1 className="font-heading text-xl font-semibold">
        Déclarer un incident
      </h1>

      {lease?.apartments && (
        <p className="text-sm text-muted-foreground">
          Concerne&nbsp;: {lease.apartments.buildings?.name ?? "votre logement"}
          {lease.apartments.number ? ` · ${lease.apartments.number}` : ""}
        </p>
      )}

      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <IncidentForm />
        </CardContent>
      </Card>
    </div>
  );
}
