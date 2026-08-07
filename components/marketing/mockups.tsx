import {
  Banknote,
  Home,
  PackageMinus,
  ReceiptText,
  ScrollText,
  Users,
} from "lucide-react";

import { formatCompactAmount, formatCurrency } from "@/lib/money";
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
const compact = formatCompactAmount;

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
      <p className="text-[10px] leading-tight font-medium text-[var(--m-ink-soft)]">
        {label}
      </p>
      {/* `truncate` : dernier rempart si un montant dépassait malgré
          l'abrégé — mieux vaut couper que déborder de la carte. */}
      <p
        className={cn(
          "font-heading mt-1 truncate text-base font-semibold",
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

/** Vue d'ensemble de l'entreprise, en fenêtre. */
export function DashboardMockup({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--m-line)] bg-[var(--m-page)] shadow-[0_1px_2px_rgba(31,41,55,0.05),0_24px_60px_-30px_rgba(31,41,55,0.35)]",
        className,
      )}
    >
      <WindowChrome title="caisseops.app / vue d'ensemble" />

      <div className="flex">
        <nav className="hidden w-40 shrink-0 flex-col gap-0.5 border-r border-[var(--m-line)] bg-[var(--m-subtle)] p-3 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="flex size-6 items-center justify-center rounded-md bg-[var(--m-deep)] text-white">
              <ReceiptText className="size-3" />
            </span>
            <span className="text-[11px] font-semibold">Ets Konan & Fils</span>
          </div>
          {[
            { icon: Home, label: "Vue d'ensemble", active: true },
            { icon: ReceiptText, label: "Reçus" },
            { icon: Banknote, label: "Bons de caisse" },
            { icon: PackageMinus, label: "Bons de sortie" },
            { icon: ScrollText, label: "Journal d'audit" },
            { icon: Users, label: "Membres" },
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
            <Stat label="Entrées du mois" value={compact(8450000)} hint="F CFA" />
            <Stat label="Sorties du mois" value={compact(5120000)} hint="F CFA" />
            <Stat label="Solde du mois" value={compact(3330000)} hint="F CFA" accent />
            <Stat label="Pièces émises" value="131" hint="ce mois-ci" />
          </div>

          {/* Histogramme : douze barres, hauteurs fixes pour rester
              identique d'un rendu à l'autre. */}
          <div className="mt-3 rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] p-3">
            <p className="text-[10px] font-medium text-[var(--m-ink-soft)]">
              Mouvements de caisse sur douze mois
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
              ["REC-2026-0148", "Mme Awa Diallo · avance sur commande", money(275000)],
              ["BC-2026-0062", "Sortie · ravitaillement chantier Koumassi", money(180000)],
              ["BS-2026-0021", "12 articles · départ chantier Koumassi", "Visa chef de service"],
            ].map(([numero, detail, aside], i) => (
              <div
                key={numero}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2.5",
                  i > 0 && "border-t border-[var(--m-line)]",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium">
                    {numero}
                  </span>
                  <span className="block text-[10px] text-[var(--m-ink-soft)]">
                    {detail}
                  </span>
                </span>
                <span className="text-[11px] font-medium">{aside}</span>
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

/** Vue d'ensemble sur téléphone. */
export function OwnerPhoneScreen() {
  return (
    <div aria-hidden className="px-3 pb-3">
      <p className="px-1 pt-2 text-[11px] font-semibold">Vue d&apos;ensemble</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat label="Entrées" value={compact(8450000)} hint="F CFA" />
        <Stat label="Sorties" value={compact(5120000)} hint="F CFA" />
        <Stat label="Solde" value={compact(3330000)} hint="F CFA" accent />
        <Stat label="Pièces émises" value="131" />
      </div>

      <div className="mt-2 rounded-lg border border-[var(--m-sage)]/50 bg-[var(--m-sage)]/10 p-2.5">
        <p className="text-[10px] font-medium">REC-2026-0148 imprimé</p>
        <p className="text-[9px] text-[var(--m-ink-soft)]">
          275 000 F CFA · Mme Awa Diallo
        </p>
      </div>

      <div className="mt-2 space-y-1.5">
        {[
          ["Reçus", "48 ce mois-ci"],
          ["Bons de caisse", "62 ce mois-ci"],
          ["Bons de sortie", "21 ce mois-ci"],
        ].map(([carnet, count]) => (
          <div
            key={carnet}
            className="flex items-center justify-between rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] p-2.5"
          >
            <p className="text-[10px] font-medium">{carnet}</p>
            <p className="text-[9px] text-[var(--m-ink-soft)]">{count}</p>
          </div>
        ))}
      </div>

      <BottomBar items={["Accueil", "Reçus", "Caisse", "Sorties"]} active={0} />
    </div>
  );
}

/** Feuille de reçu sur téléphone, fidèle à l'imprimé. */
export function ReceiptPhoneScreen() {
  return (
    <div aria-hidden className="px-3 pb-3">
      <p className="px-1 pt-2 text-[11px] font-semibold">Reçu REC-2026-0148</p>

      <div className="mt-2 rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] p-3">
        <p className="text-center text-[10px] font-semibold">
          Ets Konan &amp; Fils — S.A.R.L.
        </p>
        <p className="mt-0.5 text-center text-[8px] text-[var(--m-ink-soft)]">
          Négoce de matériaux · Koumassi
        </p>

        <div className="mt-2 border-t border-[var(--m-line)] pt-2">
          <p className="text-[9px] text-[var(--m-ink-soft)]">Reçu de</p>
          <p className="text-[10px] font-medium">Mme Awa Diallo</p>
        </div>

        {/* Cadre « bon pour francs », comme sur le papier à en-tête. */}
        <div className="mt-2 rounded-md border-2 border-[var(--m-ink)]/70 p-2 text-center">
          <p className="text-[8px] text-[var(--m-ink-soft)]">
            Bon pour francs
          </p>
          <p className="font-heading text-lg font-semibold">{money(275000)}</p>
        </div>

        <p className="mt-2 text-[8px] leading-snug text-[var(--m-ink-soft)]">
          Deux cent soixante-quinze mille francs CFA
        </p>

        <div className="mt-2 space-y-1 border-t border-[var(--m-line)] pt-2 text-[9px]">
          <p className="flex justify-between">
            <span className="text-[var(--m-ink-soft)]">Article</span>
            <span>Ciment 50 kg × 40</span>
          </p>
          <p className="flex justify-between">
            <span className="text-[var(--m-ink-soft)]">Avance</span>
            <span>{money(200000)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-[var(--m-ink-soft)]">Reste</span>
            <span>{money(75000)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-[var(--m-ink-soft)]">Établi par</span>
            <span>K. Yao</span>
          </p>
        </div>
      </div>

      <BottomBar items={["Accueil", "Reçus", "Caisse", "Sorties"]} active={1} />
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
