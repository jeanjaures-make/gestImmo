import { Letterhead } from "@/components/letterhead";
import {
  AmountBox,
  CheckBox,
  DottedField,
  PrintedDate,
  Sheet,
  SignatureRow,
} from "@/components/print/sheet";
import { formatAmount } from "@/lib/money";
import { splitDate, type CashVoucher, type Organization } from "@/lib/types";

/**
 * Le bon de caisse, tel qu'il s'imprime.
 *
 * Les cases « Entrée / Sortie », « Cash / Dépôt » et « compte personnel /
 * compte entreprise » sont pré-cochées d'après la saisie. C'est tout
 * l'intérêt d'émettre depuis l'application : le bon sort de l'imprimante
 * complet, là où le carnet exigeait trois coups de stylo qu'on oubliait.
 */
export function CashVoucherSheet({
  voucher,
  organization,
}: {
  voucher: CashVoucher;
  organization: Organization;
}) {
  const { day, month, year } = splitDate(voucher.issued_on);

  return (
    <Sheet className="text-[11px]">
      <Letterhead organization={organization} />

      <div className="mt-3 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            BON DE CAISSE
          </h1>
          <p className="mt-0.5 text-[9px] font-semibold">Nº {voucher.number}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <PrintedDate day={day} month={month} year={year} />
          <AmountBox currencyLabel="F. cfa">
            {formatAmount(voucher.amount)}
          </AmountBox>
        </div>
      </div>

      {/* Entrée / Sortie : deux cases et non un intitulé unique. Le sens du
          mouvement se lit alors d'un coup d'œil sur une pile de bons. */}
      <div className="mt-3 flex justify-center gap-12 text-base">
        <CheckBox checked={voucher.direction === "entree"} label="Entrée" />
        <CheckBox checked={voucher.direction === "sortie"} label="Sortie" />
      </div>

      <div className="mt-3 flex flex-col gap-2.5 text-sm">
        <DottedField label="REÇU de Mr ou Mme :" value={voucher.counterparty} />

        <DottedField
          label="Montant ( en lettre ) :"
          value={voucher.amount_in_words}
          labelClassName="italic"
        />

        <DottedField label="Motif :" value={voucher.reason} />

        <div className="flex gap-6">
          <DottedField
            label="AVANCE :"
            value={voucher.advance ? formatAmount(voucher.advance) : ""}
            suffix="f cfa"
            className="flex-1"
          />
          <DottedField
            label="RESTE :"
            value={voucher.balance ? formatAmount(voucher.balance) : ""}
            suffix="f cfa"
            className="flex-1"
          />
        </div>

        <DottedField
          label="ORDRE DONNÉ PAR :"
          value={voucher.ordered_by}
          labelClassName="italic"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 text-[12px]">
        <div className="flex flex-wrap items-baseline gap-x-12 gap-y-2">
          <CheckBox checked={voucher.settlement === "cash"} label="CASH" />
          <span className="flex flex-1 items-baseline gap-1.5">
            <CheckBox
              checked={voucher.settlement === "depot"}
              label="DÉPÔT :"
            />
            <span className="dotted min-w-[120px]">{voucher.deposit_ref}</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-x-12 gap-y-2">
          <CheckBox
            checked={voucher.account === "personal"}
            label="POUR COMPTE PERSONNEL"
          />
          <CheckBox
            checked={voucher.account === "company"}
            label="POUR LE COMPTE ENTREPRISE"
          />
        </div>
      </div>

      <div className="mt-4 px-4">
        <SignatureRow labels={["BÉNÉFICIAIRE", "COMPTABILITÉ", "DIRECTION"]} />
      </div>
    </Sheet>
  );
}
