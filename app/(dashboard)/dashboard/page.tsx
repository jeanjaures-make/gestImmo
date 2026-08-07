import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Landmark,
  PackageOpen,
  ReceiptText,
  Scale,
  UserRound,
  Wallet,
} from "lucide-react";

import {
  CashflowChart,
  IssuanceChart,
  ReceiptsChart,
  type CashflowPoint,
  type IssuancePoint,
  type ReceiptsPoint,
} from "@/components/charts";
import { PeriodSelector } from "@/components/period-selector";
import { readPeriod } from "@/lib/periods";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui/kit";
import { hasRole, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency } from "@/lib/money";
import { formatCurrency, formatDate, type DocumentKind } from "@/lib/types";

export const metadata = { title: "Vue d'ensemble — CaisseOps" };

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
  receipts: "reçu",
  cash_vouchers: "bon de caisse",
  delivery_notes: "bon de sortie",
  delivery_note_lines: "article de bon de sortie",
  organizations: "en-tête de l'entreprise",
  profiles: "membre",
};

const ACTION_VERBS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

/** Préfixe imprimé par nature de pièce. Miroir de `document_prefix()`. */
const KIND_PREFIXES: Record<DocumentKind, string> = {
  receipt: "REC",
  cash_voucher: "BC",
  delivery_note: "BS",
};

function Stat({
  label,
  value,
  exact,
  hint,
  icon: Icon,
  emphasis,
}: {
  label: string;
  value: string;
  /** Montant exact, quand `value` est abrégé. Révélé au survol. */
  exact?: string;
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
        {/* Les montants en francs CFA comptent trois à quatre chiffres de
            plus que les mêmes sommes en euros : sans abrègement ni
            troncature, ils débordaient de la tuile sur téléphone. */}
        <div
          title={exact}
          className={`font-heading mt-1.5 truncate text-xl font-semibold tabular-nums sm:text-2xl ${
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

  const period = readPeriod(monthsParam);

  const supabase = await createClient();
  const months = lastMonths(period);
  const since = `${months[0].key}-01`;
  const currentMonth = months[months.length - 1].key;
  const currentYear = Number(currentMonth.slice(0, 4));

  const canSeeActivity = hasRole(profile.role, "owner", "manager");

  // Le RLS restreint chaque requête à l'organisation de l'utilisateur.
  const [
    receiptsResult,
    vouchersResult,
    notesResult,
    countersResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from("receipts")
      .select("id, number, issued_on, payer, amount, balance")
      .gte("issued_on", since)
      .order("issued_on", { ascending: false })
      .order("number", { ascending: false })
      .returns<
        {
          id: string;
          number: string;
          issued_on: string;
          payer: string;
          amount: number;
          balance: number;
        }[]
      >(),
    supabase
      .from("cash_vouchers")
      .select(
        "id, number, issued_on, direction, amount, counterparty, settlement, deposit_ref, account",
      )
      .gte("issued_on", since)
      .order("issued_on", { ascending: false })
      .order("number", { ascending: false })
      .returns<
        {
          id: string;
          number: string;
          issued_on: string;
          direction: "entree" | "sortie";
          amount: number;
          counterparty: string;
          settlement: "cash" | "depot";
          deposit_ref: string | null;
          account: "personal" | "company";
        }[]
      >(),
    supabase
      .from("delivery_notes")
      .select("id, number, issued_on, issuer, service")
      .gte("issued_on", since)
      .order("issued_on", { ascending: false })
      .order("number", { ascending: false })
      .returns<
        {
          id: string;
          number: string;
          issued_on: string;
          issuer: string;
          service: string;
        }[]
      >(),
    // Le compteur donne le prochain numéro sans avoir à lire la dernière
    // pièce émise — et sans se tromper si la dernière a été supprimée.
    supabase
      .from("document_counters")
      .select("kind, year, last_value")
      .eq("year", currentYear)
      .returns<{ kind: DocumentKind; year: number; last_value: number }[]>(),
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

  const receipts = receiptsResult.data ?? [];
  const vouchers = vouchersResult.data ?? [];
  const notes = notesResult.data ?? [];
  const counters = countersResult.data ?? [];
  const activity = activityResult.data ?? [];

  const sum = <T,>(rows: T[], amount: (row: T) => number | string) =>
    rows.reduce((total, row) => total + Number(amount(row)), 0);

  const thisMonth = <T extends { issued_on: string }>(rows: T[]) =>
    rows.filter((row) => monthKey(row.issued_on) === currentMonth);

  const receiptsThisMonth = thisMonth(receipts);
  const vouchersThisMonth = thisMonth(vouchers);
  const notesThisMonth = thisMonth(notes);

  const receivedThisMonth = sum(receiptsThisMonth, (r) => r.amount);
  const outstanding = sum(receipts, (r) => r.balance);

  const entriesThisMonth = sum(
    vouchersThisMonth.filter((v) => v.direction === "entree"),
    (v) => v.amount,
  );
  const exitsThisMonth = sum(
    vouchersThisMonth.filter((v) => v.direction === "sortie"),
    (v) => v.amount,
  );
  const balanceThisMonth = entriesThisMonth - exitsThisMonth;

  const depositsThisMonth = sum(
    vouchersThisMonth.filter((v) => v.settlement === "depot"),
    (v) => v.amount,
  );
  const personalThisMonth = vouchersThisMonth.filter(
    (v) => v.account === "personal",
  );

  // Un dépôt sans référence est une pièce qu'on ne saura pas rapprocher du
  // relevé : la contrainte de base interdit l'inverse (une référence sans
  // dépôt), pas cet oubli-là.
  const depositsWithoutRef = vouchers.filter(
    (v) => v.settlement === "depot" && !v.deposit_ref,
  );

  const cashflowSeries: CashflowPoint[] = [];
  const receiptsSeries: ReceiptsPoint[] = [];
  const issuanceSeries: IssuancePoint[] = [];

  for (const { key, label } of months) {
    const monthVouchers = vouchers.filter((v) => monthKey(v.issued_on) === key);
    const entrees = sum(
      monthVouchers.filter((v) => v.direction === "entree"),
      (v) => v.amount,
    );
    const sorties = sum(
      monthVouchers.filter((v) => v.direction === "sortie"),
      (v) => v.amount,
    );
    const monthReceipts = receipts.filter((r) => monthKey(r.issued_on) === key);

    cashflowSeries.push({ month: label, entrees, sorties, net: entrees - sorties });
    receiptsSeries.push({
      month: label,
      amount: sum(monthReceipts, (r) => r.amount),
    });
    issuanceSeries.push({
      month: label,
      receipts: monthReceipts.length,
      vouchers: monthVouchers.length,
      notes: notes.filter((n) => monthKey(n.issued_on) === key).length,
    });
  }

  const hasCashflow = cashflowSeries.some((p) => p.entrees > 0 || p.sorties > 0);
  const hasReceipts = receiptsSeries.some((p) => p.amount > 0);
  const hasIssuance = issuanceSeries.some(
    (p) => p.receipts > 0 || p.vouchers > 0 || p.notes > 0,
  );

  /** Le numéro que portera la prochaine pièce de cette nature. */
  const nextNumber = (kind: DocumentKind) => {
    const counter = counters.find((c) => c.kind === kind);
    const value = (counter?.last_value ?? 0) + 1;
    return `${KIND_PREFIXES[kind]}-${currentYear}-${String(value).padStart(4, "0")}`;
  };

  const registers = [
    {
      href: "/receipts",
      label: "Reçus",
      icon: ReceiptText,
      count: receiptsThisMonth.length,
      next: nextNumber("receipt"),
    },
    {
      href: "/cash-vouchers",
      label: "Bons de caisse",
      icon: Wallet,
      count: vouchersThisMonth.length,
      next: nextNumber("cash_voucher"),
    },
    {
      href: "/delivery-notes",
      label: "Bons de sortie",
      icon: PackageOpen,
      count: notesThisMonth.length,
      next: nextNumber("delivery_note"),
    },
  ];

  const alerts = [
    outstanding > 0 && {
      href: "/receipts",
      label: `${formatCurrency(outstanding)} restant dû`,
      detail: "Reçus portant un reste à régler",
    },
    depositsWithoutRef.length > 0 && {
      href: "/cash-vouchers",
      label: `${depositsWithoutRef.length} dépôt(s) sans référence`,
      detail: depositsWithoutRef
        .slice(0, 2)
        .map((v) => `${v.number} (${formatDate(v.issued_on)})`)
        .join(" · "),
    },
    personalThisMonth.length > 0 && {
      href: "/cash-vouchers",
      label: `${personalThisMonth.length} mouvement(s) sur compte personnel`,
      detail: `${formatCurrency(sum(personalThisMonth, (v) => v.amount))} imputés hors compte entreprise`,
    },
  ].filter(Boolean) as { href: string; label: string; detail: string }[];

  const recentReceipts = receipts.slice(0, 4);

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description="Ce qui est entré, ce qui est sorti, et ce qui reste à recouvrer."
      />

      {/* Les quatre indicateurs décisifs d'abord : deux colonnes sur
          téléphone, donc visibles sans défiler. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Reçu ce mois"
          value={formatCompactCurrency(receivedThisMonth)}
          exact={formatCurrency(receivedThisMonth)}
          hint={`${receiptsThisMonth.length} reçu(s) émis`}
          icon={ReceiptText}
        />
        <Stat
          label="Entrées de caisse"
          value={formatCompactCurrency(entriesThisMonth)}
          exact={formatCurrency(entriesThisMonth)}
          hint="Bons de caisse du mois"
          icon={ArrowDownLeft}
        />
        <Stat
          label="Sorties de caisse"
          value={formatCompactCurrency(exitsThisMonth)}
          exact={formatCurrency(exitsThisMonth)}
          hint="Bons de caisse du mois"
          icon={ArrowUpRight}
        />
        <Stat
          label="Solde du mois"
          value={formatCompactCurrency(balanceThisMonth)}
          exact={formatCurrency(balanceThisMonth)}
          hint="Entrées − sorties"
          icon={Scale}
          emphasis={balanceThisMonth < 0 ? "danger" : "success"}
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

      {/* Les trois carnets, avec le numéro que portera la prochaine pièce :
          c'est l'information qu'on cherche avant de sortir un carnet à
          souche, et elle évite d'ouvrir la liste pour la deviner. */}
      <section className="mt-5">
        <h2 className="mb-2 text-sm font-semibold">Carnets</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {registers.map(({ href, label, icon: Icon, count, next }) => (
            <Link key={href} href={href}>
              <Card className="h-full gap-0 py-0 active:bg-muted">
                <CardContent className="flex min-h-20 items-center gap-3 p-4">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} ce mois · prochain nº{" "}
                      <span className="tabular-nums">{next}</span>
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Reste à recouvrer"
          value={formatCompactCurrency(outstanding)}
          exact={formatCurrency(outstanding)}
          hint={`Sur ${period} mois`}
          icon={AlertTriangle}
          emphasis={outstanding > 0 ? "danger" : undefined}
        />
        <Stat
          label="Déposé ce mois"
          value={formatCompactCurrency(depositsThisMonth)}
          exact={formatCurrency(depositsThisMonth)}
          hint="Banque ou mobile money"
          icon={Landmark}
        />
        <Stat
          label="Compte personnel"
          value={formatCompactCurrency(sum(personalThisMonth, (v) => v.amount))}
          exact={formatCurrency(sum(personalThisMonth, (v) => v.amount))}
          hint={`${personalThisMonth.length} mouvement(s)`}
          icon={UserRound}
        />
        <Stat
          label="Bons de sortie"
          value={String(notesThisMonth.length)}
          hint="Émis ce mois"
          icon={PackageOpen}
        />
      </div>

      {recentReceipts.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Derniers reçus</h2>
            <Link
              href="/receipts"
              className="flex min-h-11 items-center gap-0.5 text-sm text-primary"
            >
              Tout voir
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="divide-y p-0">
              {recentReceipts.map((receipt) => (
                <Link
                  key={receipt.id}
                  href={`/receipts/${receipt.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {receipt.payer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {receipt.number} · {formatDate(receipt.issued_on)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(receipt.amount)}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
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
              <CardTitle>Mouvements de caisse sur {period} mois</CardTitle>
            </CardHeader>
            <CardContent>
              {hasCashflow ? (
                <CashflowChart data={cashflowSeries} />
              ) : (
                <EmptyState>
                  Aucun bon de caisse émis sur la période.
                </EmptyState>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sommes reçues</CardTitle>
            </CardHeader>
            <CardContent>
              {hasReceipts ? (
                <ReceiptsChart data={receiptsSeries} />
              ) : (
                <EmptyState>Aucun reçu émis sur la période.</EmptyState>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pièces émises</CardTitle>
            </CardHeader>
            <CardContent>
              {hasIssuance ? (
                <IssuanceChart data={issuanceSeries} />
              ) : (
                <EmptyState>
                  Émettez votre première pièce pour voir votre activité.
                </EmptyState>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
