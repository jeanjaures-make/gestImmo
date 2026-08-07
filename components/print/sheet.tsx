import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Primitives des pièces imprimées.
 *
 * Elles reproduisent le vocabulaire du carnet à souche : une ligne de
 * pointillés à remplir, une case à cocher, un cadre de montant. Les
 * factoriser ici garantit que les trois pièces se ressemblent — c'est ce
 * qu'attend l'œil d'un comptable qui les manipule côte à côte.
 */

/** La feuille elle-même : blanche, encre noire, ombrée à l'écran seulement. */
export function Sheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sheet mx-auto rounded-sm border p-4 shadow-sm print:rounded-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Un intitulé suivi d'une ligne de pointillés portant la valeur.
 *
 * La valeur est posée SUR le trait plutôt qu'à la place : la pièce garde
 * l'allure du formulaire manuscrit, et une valeur vide laisse une ligne
 * à remplir au stylo — ce que les utilisateurs font encore souvent pour
 * les mentions décidées au moment de la remise.
 */
export function DottedField({
  label,
  value,
  suffix,
  className,
  labelClassName,
}: {
  label?: ReactNode;
  value?: ReactNode;
  /** Mention collée après le trait : « f cfa ». */
  suffix?: ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-1.5", className)}>
      {label && (
        <span className={cn("shrink-0 font-bold", labelClassName)}>
          {label}
        </span>
      )}
      <span className="dotted truncate">{value}</span>
      {suffix && <span className="shrink-0 font-bold">{suffix}</span>}
    </div>
  );
}

/** Case à cocher imprimée. Cochée, elle porte une croix bien visible. */
export function CheckBox({
  checked,
  label,
  className,
}: {
  checked: boolean;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="inline-flex size-[14px] shrink-0 items-center justify-center border-[1.5px] border-black text-[11px] leading-none font-black">
        {checked ? "X" : ""}
      </span>
      {label && <span className="font-bold">{label}</span>}
    </span>
  );
}

/**
 * La date en trois cases : « Date : 12/03/2026 ».
 *
 * Le format éclaté est celui du papier. Le reproduire évite qu'un
 * utilisateur qui compare l'écran et son ancien carnet se demande s'il
 * s'agit bien du même document.
 */
export function PrintedDate({
  day,
  month,
  year,
  className,
}: {
  day: string;
  month: string;
  year: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-1 font-bold", className)}>
      <span>Date :</span>
      <span className="dotted min-w-[26px] text-center">{day}</span>
      <span>/</span>
      <span className="dotted min-w-[26px] text-center">{month}</span>
      <span>/</span>
      <span className="dotted min-w-[42px] text-center">{year}</span>
    </div>
  );
}

/** Cadre de montant : le libellé de devise, puis la somme encadrée. */
export function AmountBox({
  currencyLabel,
  children,
}: {
  currencyLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-stretch border-[1.5px] border-black">
      <span className="border-r-[1.5px] border-black px-2 py-1 text-base font-bold whitespace-nowrap">
        {currencyLabel}
      </span>
      <span className="min-w-[150px] px-2 py-1 text-right text-base font-bold tabular-nums">
        {children}
      </span>
    </div>
  );
}

/** Ligne de signatures en pied de pièce. */
export function SignatureRow({ labels }: { labels: string[] }) {
  return (
    <div className="flex justify-between gap-4 text-[10px] font-bold italic underline">
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}
