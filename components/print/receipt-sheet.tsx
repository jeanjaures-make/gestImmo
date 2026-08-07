import { Letterhead } from "@/components/letterhead";
import {
  AmountBox,
  DottedField,
  Sheet,
} from "@/components/print/sheet";
import { formatAmount } from "@/lib/money";
import { formatDate, type Organization, type Receipt } from "@/lib/types";

/**
 * Le reçu, tel qu'il s'imprime.
 *
 * Reproduit le carnet à souche : en-tête compact à gauche, date à droite,
 * « REÇU » au centre et le cadre BPF — bon pour francs — en regard.
 *
 * « BPF » précède traditionnellement le montant en chiffres sur les effets
 * de commerce. On le conserve : c'est la mention que les caissiers
 * cherchent des yeux, et la remplacer par « Montant » ferait hésiter.
 */
export function ReceiptSheet({
  receipt,
  organization,
}: {
  receipt: Receipt;
  organization: Organization;
}) {
  return (
    <Sheet className="text-[11px]">
      <div className="flex items-start justify-between gap-6">
        <Letterhead organization={organization} variant="compact" />

        <div className="pt-1 text-right">
          <DottedField
            label="Date :"
            value={formatDate(receipt.issued_on)}
            className="justify-end text-sm"
          />
          <p className="mt-1 text-[9px] font-semibold">Nº {receipt.number}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-6">
        <span className="text-2xl font-bold tracking-wide">REÇU</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">BPF</span>
          <AmountBox currencyLabel="F CFA">
            {formatAmount(receipt.amount)}
          </AmountBox>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 text-sm">
        <DottedField
          label="Reçu de M./Mme"
          value={receipt.payer}
          labelClassName="text-base"
        />

        {/* Le montant en lettres occupe deux lignes sur le carnet : une
            somme à sept chiffres ne tient pas sur une seule. */}
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 text-base font-bold">la somme de</span>
          <span className="dotted min-h-[1.2em] text-[13px] font-semibold">
            {receipt.amount_in_words}
          </span>
        </div>

        <DottedField label="Article(s) :" value={receipt.articles} />

        <div className="flex gap-6">
          <DottedField
            label="Avance :"
            value={receipt.advance ? formatAmount(receipt.advance) : ""}
            suffix="F CFA"
            className="flex-1"
          />
          <DottedField
            label="Reste :"
            value={receipt.balance ? formatAmount(receipt.balance) : ""}
            suffix="F CFA"
            className="flex-1"
          />
        </div>
      </div>

      <p className="mt-1 text-right text-[10px] font-bold italic underline">
        Signature et Cachet
      </p>

      <DottedField
        label="Reçu établi par"
        value={receipt.issued_by}
        className="mt-3 max-w-[60%] text-[11px] italic"
      />
    </Sheet>
  );
}
