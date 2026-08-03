import {
  Building2,
  FileText,
  Home,
  Receipt,
  Wallet,
  Wrench,
} from "lucide-react";

import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Maquettes des écrans du produit.
 *
 * Construites en HTML et CSS plutôt qu'en captures d'écran : une image de
 * 300 ko par section coûterait le budget de performance visé, se
 * pixelliserait sur écran dense, ne suivrait pas le mode sombre, et
 * mentirait dès la première évolution de l'interface. Ici, les chiffres
 * sont fictifs mais la mise en page est celle du produit.
 *
 * `aria-hidden` : ce sont des illustrations. Les lire à voix haute
 * imposerait une bouillie de chiffres inventés ; le texte alentour porte
 * déjà le sens.
 */

// Même formateur que l'application : la vitrine ne doit pas afficher les
// montants autrement que l'écran qu'elle montre.
const money = formatCurrency;

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] p-3">
      <p className="text-[10px] font-medium text-[var(--m-ink-soft)]">{label}</p>
      <p
        className={cn(
          "font-heading mt-1 text-base font-semibold",
          accent && "text-[var(--m-sage-text)]",
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-[var(--m-ink-soft)]">{hint}</p>
      )}
    </div>
  );
}

/** Barre de titre neutre, sans imiter un navigateur en particulier. */
function WindowChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--m-line)] bg-[var(--m-subtle)] px-4 py-2.5">
      <span className="flex gap-1.5">
        <span className="size-2 rounded-full bg-[var(--m-line)]" />
        <span className="size-2 rounded-full bg-[var(--m-line)]" />
        <span className="size-2 rounded-full bg-[var(--m-line)]" />
      </span>
      <span className="ml-2 text-[11px] text-[var(--m-ink-soft)]">{title}</span>
    </div>
  );
}

/** Tableau de bord propriétaire, en fenêtre. */
export function DashboardMockup({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--m-line)] bg-[var(--m-page)] shadow-[0_1px_2px_rgba(31,41,55,0.05),0_24px_60px_-30px_rgba(31,41,55,0.35)]",
        className,
      )}
    >
      <WindowChrome title="immoops.app / vue d'ensemble" />

      <div className="flex">
        <nav className="hidden w-40 shrink-0 flex-col gap-0.5 border-r border-[var(--m-line)] bg-[var(--m-subtle)] p-3 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="flex size-6 items-center justify-center rounded-md bg-[var(--m-deep)] text-white">
              <Building2 className="size-3" />
            </span>
            <span className="text-[11px] font-semibold">Patrimoine Vallier</span>
          </div>
          {[
            { icon: Home, label: "Vue d'ensemble", active: true },
            { icon: Building2, label: "Immeubles" },
            { icon: Wallet, label: "Loyers" },
            { icon: Wrench, label: "Interventions" },
            { icon: FileText, label: "Baux" },
            { icon: Receipt, label: "Dépenses" },
          ].map(({ icon: Icon, label, active }) => (
            <span
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]",
                active
                  ? "bg-[var(--m-deep)] font-medium text-white"
                  : "text-[var(--m-ink-soft)]",
              )}
            >
              <Icon className="size-3" />
              {label}
            </span>
          ))}
        </nav>

        <div className="min-w-0 flex-1 p-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Revenus du mois" value={money(12400000)} hint="24 baux actifs" />
            <Stat label="Encaissé" value={money(11350000)} hint="92 % du dû" accent />
            <Stat label="Impayés" value={money(1050000)} hint="2 échéances" />
            <Stat label="Occupation" value="96 %" hint="24/25 logements" />
          </div>

          {/* Histogramme : douze barres, hauteurs fixes pour rester
              identique d'un rendu à l'autre. */}
          <div className="mt-3 rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] p-3">
            <p className="text-[10px] font-medium text-[var(--m-ink-soft)]">
              Encaissements sur douze mois
            </p>
            <div className="mt-3 flex h-20 items-end gap-1.5">
              {[62, 70, 58, 74, 80, 68, 86, 78, 90, 84, 94, 88].map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className={cn(
                    "flex-1 rounded-sm",
                    i === 11 ? "bg-[var(--m-sage)]" : "bg-[var(--m-deep)]/25",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)]">
            {[
              ["Résidence Vallier · A12", "Loyer encaissé", money(250000)],
              ["Le Clos des Tilleuls · B04", "Règlement déclaré", money(180000)],
              ["Résidence Vallier · C21", "Échéance en retard", money(320000)],
            ].map(([place, state, amount], i) => (
              <div
                key={place}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2.5",
                  i > 0 && "border-t border-[var(--m-line)]",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium">
                    {place}
                  </span>
                  <span className="block text-[10px] text-[var(--m-ink-soft)]">
                    {state}
                  </span>
                </span>
                <span className="text-[11px] font-medium">{amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cadre de téléphone : bordure épaisse, coins très arrondis, rien de plus. */
export function PhoneFrame({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("w-full max-w-[248px]", className)}>
      <div
        aria-hidden
        className="overflow-hidden rounded-[2rem] border-[6px] border-[var(--m-ink)] bg-[var(--m-page)] shadow-[0_20px_50px_-25px_rgba(31,41,55,0.5)]"
      >
        <div className="flex items-center justify-between bg-[var(--m-page)] px-4 pt-2 pb-1 text-[9px] text-[var(--m-ink-soft)]">
          <span>9:41</span>
          <span className="h-1 w-10 rounded-full bg-[var(--m-ink)]/70" />
          <span>100 %</span>
        </div>
        {children}
      </div>
      <figcaption className="mt-4 text-center text-sm text-[var(--m-ink-soft)]">
        {label}
      </figcaption>
    </figure>
  );
}

/** Accueil propriétaire sur téléphone. */
export function OwnerPhoneScreen() {
  return (
    <div aria-hidden className="px-3 pb-3">
      <p className="px-1 pt-2 text-[11px] font-semibold">Vue d&apos;ensemble</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat label="Revenus" value={money(12400000)} />
        <Stat label="Encaissé" value={money(11350000)} accent />
        <Stat label="Impayés" value={money(1050000)} />
        <Stat label="Occupation" value="96 %" />
      </div>

      <div className="mt-2 rounded-lg border border-[var(--m-sage)]/50 bg-[var(--m-sage)]/10 p-2.5">
        <p className="text-[10px] font-medium">1 règlement déclaré</p>
        <p className="text-[9px] text-[var(--m-ink-soft)]">
          En attente de votre validation
        </p>
      </div>

      <div className="mt-2 space-y-1.5">
        {["Résidence Vallier", "Le Clos des Tilleuls"].map((name) => (
          <div
            key={name}
            className="rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] p-2.5"
          >
            <p className="text-[10px] font-medium">{name}</p>
            <p className="text-[9px] text-[var(--m-ink-soft)]">
              12 logements · 100 % occupés
            </p>
          </div>
        ))}
      </div>

      <BottomBar items={["Accueil", "Immeubles", "Loyers", "Travaux"]} active={0} />
    </div>
  );
}

/** Espace locataire sur téléphone. */
export function TenantPhoneScreen() {
  return (
    <div aria-hidden className="px-3 pb-3">
      <p className="px-1 pt-2 text-[11px] font-semibold">Bonjour Karim</p>

      <div className="mt-2 rounded-xl bg-[var(--m-deep)] p-3 text-white dark:text-[#101419]">
        <p className="text-[9px] opacity-80">Loyer de février 2026</p>
        <p className="font-heading mt-1 text-2xl font-semibold">{money(250000)}</p>
        <p className="mt-1 text-[9px] opacity-90">À régler avant le 5</p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {["Incident", "Documents", "Mon bail"].map((label) => (
          <div
            key={label}
            className="flex min-h-12 flex-col items-center justify-center rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] text-center text-[8px] font-medium"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1.5">
        {[
          ["Janvier 2026", "Encaissé"],
          ["Décembre 2025", "Encaissé"],
        ].map(([month, state]) => (
          <div
            key={month}
            className="flex items-center justify-between rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] p-2.5"
          >
            <span className="text-[10px] font-medium">{month}</span>
            <span className="rounded-full bg-[var(--m-sage)]/15 px-2 py-0.5 text-[8px] font-medium text-[var(--m-sage-text)]">
              {state}
            </span>
          </div>
        ))}
      </div>

      <BottomBar items={["Accueil", "Bail", "Loyers", "Docs"]} active={0} />
    </div>
  );
}

function BottomBar({ items, active }: { items: string[]; active: number }) {
  return (
    <div className="mt-3 flex items-stretch border-t border-[var(--m-line)] pt-2">
      {items.map((label, i) => (
        <span
          key={label}
          className={cn(
            "flex-1 text-center text-[8px]",
            i === active
              ? "font-semibold text-[var(--m-deep)]"
              : "text-[var(--m-ink-soft)]",
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
