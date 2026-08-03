import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  FolderClosed,
  MapPin,
  Wrench,
} from "lucide-react";

import { Card, CardContent, EmptyState, StatusBadge } from "@/components/ui/kit";
import { requireTenantSession } from "@/lib/auth";
import {
  activeLease,
  effectivePaymentStatus,
  getTenantLeases,
  getTenantPayments,
  nextDuePayment,
  totalOutstanding,
} from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import {
  formatCurrency,
  formatDate,
  formatMonth,
  MAINTENANCE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  type MaintenanceStatus,
} from "@/lib/types";

export const metadata = { title: "Mon espace — ImmoOps" };

const QUICK_ACTIONS = [
  {
    href: "/portal/incidents/new",
    label: "Déclarer un incident",
    icon: Wrench,
  },
  { href: "/portal/documents", label: "Mes documents", icon: FolderClosed },
  { href: "/portal/lease", label: "Mon bail", icon: FileText },
];

export default async function PortalHomePage() {
  await requireTenantSession();

  const [leases, payments] = await Promise.all([
    getTenantLeases(),
    getTenantPayments(),
  ]);

  const lease = activeLease(leases);
  const next = nextDuePayment(payments);
  const outstanding = totalOutstanding(payments);
  const nextStatus = next ? effectivePaymentStatus(next) : null;

  const supabase = await createClient();
  const { data: incidents } = await supabase
    .from("maintenance")
    .select("id, title, status, created_at")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(3)
    .returns<
      { id: string; title: string; status: MaintenanceStatus; created_at: string }[]
    >();

  if (!lease) {
    return (
      <EmptyState>
        Aucun bail n&apos;est encore rattaché à votre compte. Contactez votre
        gestionnaire.
      </EmptyState>
    );
  }

  const monthlyTotal = Number(lease.rent) + Number(lease.charges);

  return (
    <div className="flex flex-col gap-4">
      {/* Le chiffre qui compte, en premier écran, sans défilement. */}
      <Card className="gap-0 bg-primary py-0 text-primary-foreground">
        <CardContent className="p-5">
          <p className="text-sm opacity-80">
            {next ? `Loyer de ${formatMonth(next.month)}` : "Loyer mensuel"}
          </p>
          <p className="font-heading mt-1 text-3xl font-semibold tabular-nums sm:text-4xl">
            {formatCurrency(next ? next.amount : monthlyTotal)}
          </p>
          {next && nextStatus && (
            <p className="mt-2 text-sm opacity-90">
              {nextStatus === "late"
                ? "En retard — merci de régulariser."
                : nextStatus === "partial"
                  ? `Déjà réglé : ${formatCurrency(next.amount_paid)}`
                  : "À régler"}
            </p>
          )}
          {!next && (
            <p className="mt-2 text-sm opacity-90">
              Vous êtes à jour. Rien à régler.
            </p>
          )}
        </CardContent>
      </Card>

      {outstanding > 0 && (
        <Card className="gap-0 border-destructive/40 py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {formatCurrency(outstanding)} en attente
              </p>
              <p className="text-xs text-muted-foreground">
                Toutes échéances non soldées confondues
              </p>
            </div>
            <Link
              href="/portal/payments"
              className="flex min-h-11 items-center px-2 text-sm font-medium text-primary"
            >
              Voir
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Actions au pouce : pleine largeur, hauteur généreuse. */}
      <div className="grid grid-cols-3 gap-2">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-2 text-center text-[11px] font-medium active:bg-muted"
          >
            <Icon className="size-5 text-primary" />
            {label}
          </Link>
        ))}
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Mon logement
          </p>
          <p className="font-heading mt-1 font-semibold">
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
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Loyer + charges</dt>
              <dd className="font-medium">{formatCurrency(monthlyTotal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Depuis le</dt>
              <dd className="font-medium">{formatDate(lease.start_date)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Interventions en cours</h2>
          <Link
            href="/portal/incidents"
            className="flex min-h-11 items-center gap-0.5 text-sm text-primary"
          >
            Tout voir
            <ChevronRight className="size-4" />
          </Link>
        </div>

        {incidents?.length ? (
          <div className="flex flex-col gap-2">
            {incidents.map((incident) => (
              <Card key={incident.id} className="gap-0 py-0">
                <CardContent className="flex items-center gap-3 p-4">
                  <Wrench className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {incident.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Déclarée le {formatDate(incident.created_at)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={incident.status === "in_progress" ? "info" : "warning"}
                  >
                    {MAINTENANCE_STATUS_LABELS[incident.status]}
                  </StatusBadge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState>Aucune intervention en cours.</EmptyState>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Dernières échéances</h2>
          <Link
            href="/portal/payments"
            className="flex min-h-11 items-center gap-0.5 text-sm text-primary"
          >
            Tout voir
            <ChevronRight className="size-4" />
          </Link>
        </div>

        {payments.length ? (
          <div className="flex flex-col gap-2">
            {payments.slice(0, 3).map((payment) => {
              const status = effectivePaymentStatus(payment);
              return (
                <Card key={payment.id} className="gap-0 py-0">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {formatMonth(payment.month)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(payment.amount)}
                      </p>
                    </div>
                    <StatusBadge tone={PAYMENT_STATUS_TONES[status]}>
                      {PAYMENT_STATUS_LABELS[status]}
                    </StatusBadge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState>Aucune échéance enregistrée.</EmptyState>
        )}
      </section>
    </div>
  );
}
