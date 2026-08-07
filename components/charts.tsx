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

export type CashflowPoint = {
  month: string;
  entrees: number;
  sorties: number;
  net: number;
};

/**
 * Le mouvement de caisse, mois par mois.
 *
 * Entrées et sorties partagent la même unité : une seule échelle suffit. Un
 * axe secondaire serait ici une erreur de lecture, pas un choix esthétique.
 * La ligne du solde passe sous zéro quand la caisse a plus décaissé
 * qu'encaissé — c'est précisément ce qu'on vient chercher.
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
          dataKey="entrees"
          name="Entrées"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
        <Bar
          dataKey="sorties"
          name="Sorties"
          fill="var(--chart-3)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
        <Line
          type="monotone"
          dataKey="net"
          name="Solde"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export type ReceiptsPoint = { month: string; amount: number };

/** Série unique → pas de boîte de légende, le titre de la carte suffit. */
export function ReceiptsChart({ data }: { data: ReceiptsPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="receiptsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
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
          name="Reçus"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#receiptsFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type IssuancePoint = {
  month: string;
  receipts: number;
  vouchers: number;
  notes: number;
};

/**
 * Le nombre de pièces émises, par nature.
 *
 * Des effectifs, pas des montants : l'infobulle le dit en n'affichant pas
 * de devise. C'est l'indicateur d'activité du carnet — un mois sans bon de
 * sortie se voit d'un coup d'œil.
 */
export function IssuanceChart({ data }: { data: IssuancePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        barGap={2}
        margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
      >
        <CartesianGrid {...GRID} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={<ChartTooltip unit="count" />}
        />
        <Legend wrapperStyle={LEGEND_STYLE} />
        <Bar
          dataKey="receipts"
          name="Reçus"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={14}
        />
        <Bar
          dataKey="vouchers"
          name="Bons de caisse"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          maxBarSize={14}
        />
        <Bar
          dataKey="notes"
          name="Bons de sortie"
          fill="var(--chart-4)"
          radius={[4, 4, 0, 0]}
          maxBarSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
