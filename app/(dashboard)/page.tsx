import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ChevronRight,
  DoorOpen,
  Percent,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";

import {
  CashflowChart,
  MonthlyExpensesChart,
  MonthlyRevenueChart,
  PortfolioChart,
  type CashflowPoint,
  type MonthlyExpensePoint,
  type MonthlyRevenuePoint,
  type PortfolioPoint,
} from "@/components/charts";
import { PeriodSelector, PERIODS, type Period } from "@/components/period-selector";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui/kit";
import { hasRole, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/types";

export const metadata = { title: "Vue d'ensemble — ImmoOps" };

/** Les N derniers mois, du plus ancien au plus récent. */
function lastMonths(count: number) {
  const months: { key: string; label: string }[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() - (count - 1));

  for (let i = 0; i < count; i += 1) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: cursor.toLocaleDateString("fr-FR", {
        month: "short",
        ...(count > 12 ? { year: "2-digit" } : {}),
      }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

const monthKey = (date: string) => date.slice(0, 7);

const ENTITY_LABELS: Record<string, string> = {
  buildings: "immeuble",
  apartments: "logement",
  tenants: "locataire",
  leases: "bail",
  rent_payments: "échéance",
  expenses: "dépense",
  maintenance: "intervention",
  documents: "document",
};

const ACTION_VERBS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  emphasis?: "danger" | "success";
}) {
  return (
    <Card size="sm" className="gap-0 py-0">
      {/* Compact sur mobile : deux colonnes tiennent au-dessus de la ligne
          de flottaison, l'information clé est lue sans défiler. */}
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
        <div
          className={`font-heading mt-1.5 text-xl font-semibold sm:text-2xl ${
            emphasis === "danger"
              ? "text-destructive"
              : emphasis === "success"
                ? "text-success"
                : ""
          }`}
        >
          {value}
        </div>
        {hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { profile } = await requireSession();
  const { months: monthsParam } = await searchParams;

  const requested = Number(monthsParam);
  const period: Period = PERIODS.includes(requested as Period)
    ? (requested as Period)
    : 12;

  const supabase = await createClient();
  const months = lastMonths(period);
  const since = `${months[0].key}-01`;
  const currentMonth = months[months.length - 1].key;

  const today = new Date();
  const in60Days = new Date();
  in60Days.setDate(today.getDate() + 60);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const canSeeActivity = hasRole(profile.role, "owner", "manager");

  // Le RLS restreint chaque requête à l'organisation de l'utilisateur.
  const [
    buildingsResult,
    apartmentsResult,
    occupiedResult,
    vacantResult,
    leasesResult,
    paymentsResult,
    expensesResult,
    maintenanceResult,
    urgentResult,
    expiringResult,
    ongoingResult,
    declaredResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from("buildings")
      .select("id, name, city, estimated_value, apartments(count)")
      .order("name")
      .returns<
        {
          id: string;
          name: string;
          city: string;
          estimated_value: number | null;
          apartments: { count: number }[];
        }[]
      >(),
    supabase.from("apartments").select("*", { count: "exact", head: true }),
    supabase
      .from("apartments")
      .select("*", { count: "exact", head: true })
      .eq("status", "occupied"),
    supabase
      .from("apartments")
      .select("*", { count: "exact", head: true })
      .eq("status", "vacant"),
    supabase
      .from("leases")
      .select("rent, charges")
      .eq("status", "active")
      .returns<{ rent: number; charges: number }[]>(),
    supabase
      .from("rent_payments")
      .select("month, amount, amount_paid, status")
      .gte("month", since)
      .returns<
        { month: string; amount: number; amount_paid: number; status: string }[]
      >(),
    supabase
      .from("expenses")
      .select("expense_date, amount")
      .gte("expense_date", since)
      .returns<{ expense_date: string; amount: number }[]>(),
    supabase
      .from("maintenance")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
    supabase
      .from("maintenance")
      .select("*", { count: "exact", head: true })
      .eq("priority", "urgent")
      .in("status", ["open", "in_progress"]),
    supabase
      .from("leases")
      .select("id, end_date, tenants(firstname, lastname)")
      .eq("status", "active")
      .not("end_date", "is", null)
      .lte("end_date", iso(in60Days))
      .gte("end_date", iso(today))
      .returns<
        {
          id: string;
          end_date: string;
          tenants: { firstname: string; lastname: string } | null;
        }[]
      >(),
    supabase
      .from("maintenance")
      .select("id, title, priority, apartments(number)")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(4)
      .returns<
        {
          id: string;
          title: string;
          priority: string;
          apartments: { number: string } | null;
        }[]
      >(),
    supabase
      .from("payment_declarations")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    canSeeActivity
      ? supabase
          .from("audit_logs")
          .select("id, action, entity, actor_email, created_at")
          .order("created_at", { ascending: false })
          .limit(6)
          .returns<
            {
              id: number;
              action: string;
              entity: string;
              actor_email: string | null;
              created_at: string;
            }[]
          >()
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const buildings = buildingsResult.data ?? [];
  const leases = leasesResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const expiring = expiringResult.data ?? [];
  const ongoing = ongoingResult.data ?? [];
  const activity = activityResult.data ?? [];

  const portfolioValue = buildings.reduce(
    (sum, b) => sum + Number(b.estimated_value ?? 0),
    0,
  );
  const monthlyRevenue = leases.reduce(
    (sum, l) => sum + Number(l.rent) + Number(l.charges),
    0,
  );

  const apartmentCount = apartmentsResult.count ?? 0;
  const occupiedCount = occupiedResult.count ?? 0;
  const occupancy =
    apartmentCount > 0 ? Math.round((occupiedCount / apartmentCount) * 100) : 0;

  const yieldRate =
    portfolioValue > 0 ? ((monthlyRevenue * 12) / portfolioValue) * 100 : null;

  const thisMonthPayments = payments.filter(
    (p) => monthKey(p.month) === currentMonth,
  );
  const collectedThisMonth = thisMonthPayments.reduce(
    (sum, p) => sum + Number(p.amount_paid),
    0,
  );
  const dueThisMonth = thisMonthPayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const unpaid = payments
    .filter((p) => p.status !== "paid" && monthKey(p.month) <= currentMonth)
    .reduce((sum, p) => sum + (Number(p.amount) - Number(p.amount_paid)), 0);
  const expensesThisMonth = expenses
    .filter((e) => monthKey(e.expense_date) === currentMonth)
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const netThisMonth = collectedThisMonth - expensesThisMonth;

  const revenueSeries: MonthlyRevenuePoint[] = [];
  const expenseSeries: MonthlyExpensePoint[] = [];
  const cashflowSeries: CashflowPoint[] = [];

  for (const { key, label } of months) {
    const slice = payments.filter((p) => monthKey(p.month) === key);
    const due = slice.reduce((sum, p) => sum + Number(p.amount), 0);
    const collected = slice.reduce((sum, p) => sum + Number(p.amount_paid), 0);
    const spent = expenses
      .filter((e) => monthKey(e.expense_date) === key)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    revenueSeries.push({ month: label, due, collected });
    expenseSeries.push({ month: label, amount: spent });
    cashflowSeries.push({
      month: label,
      collected,
      expenses: spent,
      net: collected - spent,
    });
  }

  const portfolioSeries: PortfolioPoint[] = buildings
    .map((b) => ({ name: b.name, apartments: b.apartments?.[0]?.count ?? 0 }))
    .sort((a, b) => b.apartments - a.apartments)
    .slice(0, 8);

  const hasRevenueData = revenueSeries.some((p) => p.due > 0 || p.collected > 0);
  const hasExpenseData = expenseSeries.some((p) => p.amount > 0);

  const urgentCount = urgentResult.count ?? 0;
  const declaredCount = declaredResult.count ?? 0;
  const alerts = [
    // En tête : c'est la seule alerte qui attend une décision de l'exploitant
    // plutôt qu'une simple prise de connaissance.
    declaredCount > 0 && {
      href: "/payments",
      label: `${declaredCount} règlement(s) déclaré(s)`,
      detail: "Un locataire attend votre validation",
    },
    unpaid > 0 && {
      href: "/payments",
      label: `${formatCurrency(unpaid)} d'impayés`,
      detail: "Échéances échues non soldées",
    },
    urgentCount > 0 && {
      href: "/maintenance",
      label: `${urgentCount} intervention(s) urgente(s)`,
      detail: "À traiter en priorité",
    },
    expiring.length > 0 && {
      href: "/leases",
      label: `${expiring.length} bail/baux expirent sous 60 jours`,
      detail: expiring
        .slice(0, 2)
        .map((l) =>
          l.tenants
            ? `${l.tenants.firstname} ${l.tenants.lastname} (${formatDate(l.end_date)})`
            : formatDate(l.end_date),
        )
        .join(" · "),
    },
    (vacantResult.count ?? 0) > 0 && {
      href: "/apartments",
      label: `${vacantResult.count} logement(s) vacant(s)`,
      detail: "Perte de revenu potentielle",
    },
  ].filter(Boolean) as { href: string; label: string; detail: string }[];

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description="L'état de votre patrimoine et de son exploitation."
      />

      {/* Les quatre indicateurs décisifs d'abord : deux colonnes sur
          téléphone, donc visibles sans défiler. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Revenus mensuels"
          value={formatCurrency(monthlyRevenue)}
          hint="Baux actifs"
          icon={Wallet}
        />
        <Stat
          label="Encaissé ce mois"
          value={formatCurrency(collectedThisMonth)}
          hint={`sur ${formatCurrency(dueThisMonth)}`}
          icon={TrendingUp}
        />
        <Stat
          label="Impayés"
          value={formatCurrency(unpaid)}
          hint="Échéances échues"
          icon={AlertTriangle}
          emphasis={unpaid > 0 ? "danger" : undefined}
        />
        <Stat
          label="Occupation"
          value={`${occupancy} %`}
          hint={`${occupiedCount}/${apartmentCount} logements`}
          icon={DoorOpen}
        />
      </div>

      {alerts.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">Alertes</h2>
          <div className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <Link key={alert.href + alert.label} href={alert.href}>
                <Card className="gap-0 border-warning/40 py-0 active:bg-muted">
                  <CardContent className="flex min-h-14 items-center gap-3 p-4">
                    <AlertTriangle className="size-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{alert.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {alert.detail}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {buildings.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Mes immeubles</h2>
            <Link
              href="/buildings"
              className="flex min-h-11 items-center gap-0.5 text-sm text-primary"
            >
              Tout voir
              <ChevronRight className="size-4" />
            </Link>
          </div>
          {/* Défilement horizontal : le pouce balaie, il ne vise pas. */}
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {buildings.map((building) => (
              <Link
                key={building.id}
                href="/buildings"
                className="min-w-44 shrink-0 rounded-xl border bg-card p-4 active:bg-muted"
              >
                <Building2 className="size-4 text-muted-foreground" />
                <p className="mt-2 truncate text-sm font-medium">
                  {building.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {building.city} · {building.apartments?.[0]?.count ?? 0}{" "}
                  logement(s)
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Cashflow du mois"
          value={formatCurrency(netThisMonth)}
          hint="Encaissé − dépenses"
          icon={PiggyBank}
          emphasis={netThisMonth < 0 ? "danger" : "success"}
        />
        <Stat
          label="Patrimoine"
          value={portfolioValue > 0 ? formatCurrency(portfolioValue) : "—"}
          hint={`${buildings.length} immeuble(s)`}
          icon={Building2}
        />
        <Stat
          label="Rendement brut"
          value={yieldRate !== null ? `${yieldRate.toFixed(1)} %` : "—"}
          hint="Loyers annuels / valeur"
          icon={Percent}
        />
        <Stat
          label="Échéances du mois"
          value={String(thisMonthPayments.length)}
          hint={formatCurrency(dueThisMonth)}
          icon={CalendarClock}
        />
        <Stat
          label="Dépenses du mois"
          value={formatCurrency(expensesThisMonth)}
          icon={Receipt}
        />
        <Stat
          label="Interventions"
          value={String(maintenanceResult.count ?? 0)}
          hint="Ouvertes ou en cours"
          icon={Wrench}
        />
        <Stat
          label="Logements vacants"
          value={String(vacantResult.count ?? 0)}
          hint="À relouer"
          icon={DoorOpen}
        />
      </div>

      {ongoing.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Interventions en cours</h2>
            <Link
              href="/maintenance"
              className="flex min-h-11 items-center gap-0.5 text-sm text-primary"
            >
              Tout voir
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {ongoing.map((item) => (
              <Card key={item.id} className="gap-0 py-0">
                <CardContent className="flex min-h-14 items-center gap-3 p-4">
                  <Wrench className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.apartments?.number
                        ? `Logement ${item.apartments.number}`
                        : "Parties communes"}
                    </p>
                  </div>
                  {item.priority === "urgent" && (
                    <StatusBadge tone="danger">Urgent</StatusBadge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {canSeeActivity && activity.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Dernières activités</h2>
            <Link
              href="/audit"
              className="flex min-h-11 items-center gap-0.5 text-sm text-primary"
            >
              Journal
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="divide-y p-0">
              {activity.map((entry) => (
                <div key={entry.id} className="flex gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {ACTION_VERBS[entry.action] ?? entry.action}{" "}
                      <span className="text-muted-foreground">
                        — {ENTITY_LABELS[entry.entity] ?? entry.entity}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.actor_email ?? "Système"} ·{" "}
                      {new Date(entry.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Évolution</h2>
          <PeriodSelector current={period} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Cashflow sur {period} mois</CardTitle>
            </CardHeader>
            <CardContent>
              {hasRevenueData || hasExpenseData ? (
                <CashflowChart data={cashflowSeries} />
              ) : (
                <EmptyState>
                  Aucun encaissement ni dépense sur la période.
                </EmptyState>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Loyers appelés et encaissés</CardTitle>
            </CardHeader>
            <CardContent>
              {hasRevenueData ? (
                <MonthlyRevenueChart data={revenueSeries} />
              ) : (
                <EmptyState>Aucune échéance sur la période.</EmptyState>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dépenses</CardTitle>
            </CardHeader>
            <CardContent>
              {hasExpenseData ? (
                <MonthlyExpensesChart data={expenseSeries} />
              ) : (
                <EmptyState>Aucune dépense enregistrée.</EmptyState>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Répartition du parc</CardTitle>
            </CardHeader>
            <CardContent>
              {portfolioSeries.length ? (
                <PortfolioChart data={portfolioSeries} />
              ) : (
                <EmptyState>
                  Créez un immeuble pour voir la répartition de votre parc.
                </EmptyState>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
