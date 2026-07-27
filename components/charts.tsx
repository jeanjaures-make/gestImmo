"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/types";

const AXIS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const GRID = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

const compact = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type TooltipEntry = { name?: string; value?: number; color?: string };

/** Infobulle unique pour tous les graphiques : le texte reste en encre. */
function ChartTooltip({
  active,
  payload,
  label,
  unit = "currency",
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  unit?: "currency" | "count";
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="flex items-center gap-2 text-muted-foreground"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto font-medium text-popover-foreground">
            {unit === "currency"
              ? formatCurrency(entry.value)
              : (entry.value ?? 0)}
          </span>
        </p>
      ))}
    </div>
  );
}

const LEGEND_STYLE = { fontSize: 12, paddingTop: 8 } as const;

export type MonthlyRevenuePoint = {
  month: string;
  due: number;
  collected: number;
};

/** Deux séries → barres groupées, légende obligatoire. */
export function MonthlyRevenueChart({ data }: { data: MonthlyRevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v: number) => compact.format(v)} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={<ChartTooltip />}
        />
        <Legend wrapperStyle={LEGEND_STYLE} />
        <Bar
          dataKey="due"
          name="Dû"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
        <Bar
          dataKey="collected"
          name="Encaissé"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export type MonthlyExpensePoint = { month: string; amount: number };

/** Série unique → pas de boîte de légende, le titre de la carte suffit. */
export function MonthlyExpensesChart({ data }: { data: MonthlyExpensePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v: number) => compact.format(v)} />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          content={<ChartTooltip />}
        />
        <Area
          type="monotone"
          dataKey="amount"
          name="Dépenses"
          stroke="var(--chart-3)"
          strokeWidth={2}
          fill="url(#expenseFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type CashflowPoint = {
  month: string;
  collected: number;
  expenses: number;
  net: number;
};

/**
 * Encaissements et dépenses partagent la même unité : une seule échelle
 * suffit. Un axe secondaire serait ici une erreur de lecture, pas un choix
 * esthétique.
 */
export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={data}
        barGap={2}
        margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
      >
        <CartesianGrid {...GRID} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v: number) => compact.format(v)} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={<ChartTooltip />}
        />
        <Legend wrapperStyle={LEGEND_STYLE} />
        <Bar
          dataKey="collected"
          name="Encaissé"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
        <Bar
          dataKey="expenses"
          name="Dépenses"
          fill="var(--chart-3)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
        <Line
          type="monotone"
          dataKey="net"
          name="Cashflow net"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export type PortfolioPoint = { name: string; apartments: number };

/** Comparaison de grandeurs entre catégories nommées → barres horizontales. */
export function PortfolioChart({ data }: { data: PortfolioPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
      >
        <CartesianGrid {...GRID} vertical horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...AXIS} />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          {...AXIS}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={<ChartTooltip unit="count" />}
        />
        <Bar
          dataKey="apartments"
          name="Logements"
          fill="var(--chart-1)"
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
