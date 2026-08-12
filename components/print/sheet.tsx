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
  wrap,
  className,
  labelClassName,
}: {
  label?: ReactNode;
  value?: ReactNode;
  /** Mention collée après le trait : « f cfa ». */
  suffix?: ReactNode;
  /**
   * Laisse la valeur passer à la ligne au lieu de la couper.
   *
   * Par défaut le texte est tronqué : sur une ligne unique — un motif, une
   * référence de dépôt — c'est le comportement voulu, la pièce garde sa
   * hauteur. Mais là où le carnet réserve deux ou trois lignes, tronquer
   * amputerait la mention : un montant en lettres coupé par des points de
   * suspension ne vaut rien devant un comptable.
   */
  wrap?: boolean;
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
      <span className={cn("dotted", wrap ? "min-h-[1.2em]" : "truncate")}>
        {value}
      </span>
      {suffix && <span className="shrink-0 font-bold">{suffix}</span>}
    </div>
  );
}

/**
 * Ligne de pointillés seule, sans intitulé.
 *
 * Le carnet réserve deux ou trois lignes aux mentions longues — un nom
 * composé, une somme à sept chiffres en toutes lettres. Le texte y court
 * naturellement ; ces lignes de renfort reproduisent la place disponible.
 */
export function DottedLine({ className }: { className?: string }) {
  return (
    <div className={cn("flex", className)}>
      <span className="dotted min-h-[1.2em]" />
    </div>
  );
}

/**
 * Case à cocher imprimée. Cochée, elle porte une croix bien visible.
 *
 * `labelFirst` place l'intitulé avant la case. Le carnet fait les deux :
 * « Entrée ☐ » en tête de bon, « ☐ CASH » dans le pied. L'ordre n'est pas
 * un détail de goût — c'est ce que l'œil suit en dépouillant une pile.
 */
export function CheckBox({
  checked,
  label,
  labelFirst,
  className,
}: {
  checked: boolean;
  label?: ReactNode;
  labelFirst?: boolean;
  className?: string;
}) {
  const box = (
    <span className="inline-flex size-[14px] shrink-0 items-center justify-center border-[1.5px] border-black text-[11px] leading-none font-black">
      {checked ? "X" : ""}
    </span>
  );
  const text = label && <span className="font-bold">{label}</span>;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {labelFirst ? (
        <>
          {text}
          {box}
        </>
      ) : (
        <>
          {box}
          {text}
        </>
      )}
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

/**
 * Cadre de montant : le libellé de devise, puis la somme encadrée.
 *
 * Le libellé est facultatif. Le bon de caisse porte bien sa cellule
 * « F. cfa » ; le reçu, lui, fait précéder le cadre d'un « BPF » posé à
 * l'extérieur — l'encadrer à nouveau doublerait la mention.
 */
export function AmountBox({
  currencyLabel,
  className,
  children,
}: {
  currencyLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-stretch border-[1.5px] border-black", className)}>
      {currencyLabel && (
        <span className="border-r-[1.5px] border-black px-2 py-1 text-base font-bold whitespace-nowrap">
          {currencyLabel}
        </span>
      )}
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
