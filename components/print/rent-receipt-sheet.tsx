import { Letterhead } from "@/components/letterhead";
import {
  AmountBox,
  CheckBox,
  DottedField,
  DottedLine,
  Sheet,
} from "@/components/print/sheet";
import { formatAmount } from "@/lib/money";
import {
  formatDate,
  PROPERTY_KIND_LABELS,
  RENT_PAYMENT_METHOD_LABELS,
  type Organization,
  type RentPaymentMethod,
  type RentReceipt,
} from "@/lib/types";

/**
 * La quittance de loyer, telle qu'elle s'imprime.
 *
 * ─── Le format ─────────────────────────────────────────────────────────
 * A5 paysage, 210 × 148 mm. Rien n'est déclaré ici : `app/globals.css`
 * pose déjà `@page { size: A5 landscape; margin: 8mm }` et `.sheet`
 * mesure 194 mm — soit 210 moins les marges. La quittance hérite du
 * gabarit commun à toutes les pièces du produit, et une impression
 * navigateur produit une VRAIE page A5, non une A5 posée sur une A4.
 *
 * ─── La disposition ────────────────────────────────────────────────────
 * Celle du carnet à souche que les régies utilisent : identité en haut à
 * gauche, titre encadré au centre, numéro et lieu-date à droite. Puis les
 * mentions à compléter, sur des lignes de pointillés — le vocabulaire
 * visuel des trois autres pièces, repris à l'identique pour qu'un
 * comptable qui les manipule côte à côte ne change pas de repères.
 *
 * ─── Ce qui s'imprime vient de la quittance, jamais des tables liées ────
 * `receipt.tenant_name` et non le nom actuel du locataire. La pièce a été
 * remise ; l'exemplaire du locataire ne changera pas parce qu'on a
 * corrigé une fiche six mois plus tard.
 */
export function RentReceiptSheet({
  receipt,
  organization,
}: {
  receipt: RentReceipt;
  organization: Organization;
}) {
  const methods: RentPaymentMethod[] = [
    "cheque",
    "virement",
    "especes",
    "depot",
  ];

  const city = organization.address?.split(",")[0]?.trim();
  const contacts = [organization.phone, organization.phone_alt].filter(Boolean);
  const emails = [organization.email, organization.email_alt].filter(Boolean);

  return (
    <Sheet className="relative flex flex-col text-[11px]">
      {/* Une quittance annulée reste consultable et imprimable : sa trace
          doit subsister. Mais elle ne doit jamais pouvoir être présentée
          comme une preuve de paiement valable. */}
      {receipt.status === "cancelled" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[64px] font-black tracking-widest text-black/10"
        >
          ANNULÉE
        </span>
      )}

      {/* ── En-tête ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <Letterhead organization={organization} variant="identity" />

        <div className="border-[1.5px] border-black px-3 py-1 text-center">
          <p className="text-base font-extrabold tracking-wide">
            QUITTANCE DE LOYER
          </p>
        </div>

        <div className="shrink-0 text-right leading-tight">
          <p className="text-sm font-extrabold">
            N<sup>o</sup> {receipt.number}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold">
            {city ? `${city}, le ` : "Le "}
            {formatDate(receipt.issued_on)}
          </p>
          {receipt.status === "draft" && (
            <p className="mt-0.5 text-[9px] font-bold uppercase">Brouillon</p>
          )}
        </div>
      </div>

      {/* ── Corps ────────────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-col gap-2">
        <DottedField
          label="Reçu de M./Mme"
          value={receipt.tenant_name}
          labelClassName="text-[12px]"
        />

        <div className="flex items-start justify-between gap-4">
          {/* Les quatre cases du carnet. Le mobile money n'y figure pas :
              il se lit dans la référence de paiement, et ajouter une
              cinquième case déséquilibrerait un bloc calibré pour l'A5. */}
          <div className="flex items-start gap-2">
            <span className="shrink-0 pt-0.5 font-bold">Mode de règlement</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
              {methods.map((method) => (
                <CheckBox
                  key={method}
                  checked={receipt.payment_method === method}
                  label={RENT_PAYMENT_METHOD_LABELS[method].toUpperCase()}
                />
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-bold">B.P.F</span>
            <AmountBox>{formatAmount(receipt.total_amount)}</AmountBox>
          </div>
        </div>

        {receipt.payment_method === "mobile_money" && (
          <p className="text-[10px] font-bold">
            Règlement par mobile money
            {receipt.payment_reference && ` — réf. ${receipt.payment_reference}`}
          </p>
        )}

        {/* Le montant en lettres court sur deux lignes : une somme à sept
            chiffres ne tient pas sur une seule. */}
        <div className="flex flex-col gap-1.5">
          <DottedField
            label="La somme de"
            value={receipt.amount_in_words}
            labelClassName="text-[12px]"
            wrap
          />
          <DottedLine />
        </div>

        <div className="flex gap-4">
          <DottedField
            label="correspondant au loyer de"
            value={receipt.period_label || periodRange(receipt)}
            className="flex-[2]"
          />
          <DottedField
            label="Type"
            value={
              receipt.property_kind
                ? PROPERTY_KIND_LABELS[receipt.property_kind]
                : ""
            }
            className="flex-1"
          />
        </div>

        <DottedField
          label="pour le bien"
          value={receipt.property_label}
          wrap
        />

        <DottedField
          label="situé(e)"
          value={receipt.property_address}
          wrap
        />

        <div className="flex gap-4">
          <DottedField
            label="Période du"
            value={formatDate(receipt.period_start)}
            className="flex-1"
          />
          <DottedField
            label="au"
            value={formatDate(receipt.period_end)}
            className="flex-1"
          />
          <DottedField
            label="Date de paiement"
            value={receipt.paid_on ? formatDate(receipt.paid_on) : ""}
            className="flex-1"
          />
        </div>

        {/* Le détail n'apparaît que s'il y a quelque chose à détailler :
            une quittance de loyer sec n'a pas à porter deux zéros. */}
        {(receipt.charges_amount > 0 || receipt.other_fees > 0) && (
          <div className="flex gap-4 text-[10px]">
            <DottedField
              label="Loyer"
              value={formatAmount(receipt.rent_amount)}
              className="flex-1"
            />
            {receipt.charges_amount > 0 && (
              <DottedField
                label="Charges"
                value={formatAmount(receipt.charges_amount)}
                className="flex-1"
              />
            )}
            {receipt.other_fees > 0 && (
              <DottedField
                label="Autres frais"
                value={formatAmount(receipt.other_fees)}
                className="flex-1"
              />
            )}
          </div>
        )}

        {receipt.notes && (
          <DottedField label="Observations" value={receipt.notes} wrap />
        )}
      </div>

      {/* ── Mention et signatures ────────────────────────────────────── */}
      <p className="mt-2 text-right text-[10px] font-bold italic">
        Sous toutes réserves de droit — DONT QUITTANCE
      </p>

      <div className="mt-1 flex items-end justify-between gap-6">
        <div className="leading-tight">
          <p className="text-[10px] font-bold italic underline">Le locataire</p>
          <p className="text-[9px]">{receipt.tenant_name}</p>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[10px] font-bold italic underline">
            Le bailleur / L&apos;agence
          </p>
          <p className="text-[9px]">
            {receipt.manager_name || receipt.landlord_name || organization.name}
          </p>
        </div>
      </div>

      {/* ── Pied de page légal ───────────────────────────────────────── */}
      {(organization.address || contacts.length > 0 || emails.length > 0) && (
        <div className="mt-auto pt-2">
          <div className="h-[1.5px] bg-black" />
          <p className="mt-1 text-center text-[8px] leading-tight font-semibold">
            {organization.name}
            {organization.legal_form && ` ${organization.legal_form}`}
            {organization.address && ` — ${organization.address}`}
            {contacts.length > 0 && ` — Tél : ${contacts.join(" / ")}`}
            {emails.length > 0 && ` — ${emails.join(" / ")}`}
            {organization.website && ` — ${organization.website}`}
          </p>
        </div>
      )}
    </Sheet>
  );
}

/** Repli quand aucune période n'a été libellée à la main. */
function periodRange(receipt: RentReceipt) {
  return `${formatDate(receipt.period_start)} au ${formatDate(receipt.period_end)}`;
}
