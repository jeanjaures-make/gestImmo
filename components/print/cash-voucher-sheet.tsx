import { Letterhead } from "@/components/letterhead";
import {
  AmountBox,
  CheckBox,
  DottedField,
  DottedLine,
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
    <Sheet className="p-0 text-[11px]">
      {/* Le filet encadre toute la pièce, jusqu'au bord de la feuille : la
          souche est massicotée sur ce trait, et c'est lui qui dit au
          caissier où finit le bon quand deux sortent sur la même page.

          Marge intérieure de 3 et non de 4 : à 4, la pièce dépassait de
          deux millimètres la hauteur utile de l'A5 paysage et sortait
          suivie d'une seconde feuille vide. */}
      <div className="border border-black p-3">
        <Letterhead organization={organization} />

        <div className="mt-3 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              BON DE CAISSE
            </h1>
            <p className="mt-0.5 text-[9px] font-semibold">
              Nº {voucher.number}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <PrintedDate day={day} month={month} year={year} />
            <AmountBox currencyLabel="F. cfa">
              {formatAmount(voucher.amount)}
            </AmountBox>
          </div>
        </div>

        {/* Entrée / Sortie : deux cases et non un intitulé unique. Le sens
            du mouvement se lit alors d'un coup d'œil sur une pile de bons.
            La case suit l'intitulé, comme sur la souche — l'œil descend la
            colonne des mots, puis vérifie la croix à droite. */}
        <div className="mt-3 flex justify-center gap-12 text-base">
          <CheckBox
            checked={voucher.direction === "entree"}
            label="Entrée"
            labelFirst
          />
          <CheckBox
            checked={voucher.direction === "sortie"}
            label="Sortie"
            labelFirst
          />
        </div>

        <div className="mt-3 flex flex-col gap-2.5 text-sm">
          {/* Deux lignes pour le tiers : une raison sociale complète, avec
              sa forme juridique, ne tient pas sur une seule. */}
          <DottedField
            label="REÇU de Mr ou Mme :"
            value={voucher.counterparty}
            wrap
          />
          <DottedLine />

          <DottedField
            label={
              <>
                Montant <span className="italic">( en lettre )</span> :
              </>
            }
            value={voucher.amount_in_words}
            wrap
          />

          <DottedField label="Motif :" value={voucher.reason} />

          {/* La barre oblique sépare les deux montants. Sans elle, un
              « avance » long touche le « RESTE » qui suit et les deux
              sommes se lisent comme une seule. */}
          <div className="flex items-baseline gap-3">
            <DottedField
              label="AVANCE :"
              value={voucher.advance ? formatAmount(voucher.advance) : ""}
              suffix="f cfa"
              className="flex-1"
            />
            <span className="shrink-0 font-bold">/</span>
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

        {/* Les visas sont rentrés d'un dixième de la largeur de chaque côté,
            comme sur la souche : collés aux bords, ils se confondraient avec
            le filet du cadre. */}
        <div className="mt-4 px-[10%]">
          <SignatureRow labels={["BÉNÉFICIAIRE", "COMPTABILITÉ", "DIRECTION"]} />
        </div>
      </div>
    </Sheet>
  );
}
