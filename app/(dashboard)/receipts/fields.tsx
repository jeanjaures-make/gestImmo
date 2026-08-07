import { AmountWords } from "@/components/amount-words";
import { Field, Input, Textarea } from "@/components/ui/kit";
import { CURRENCY_LABEL, type Receipt } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Les champs d'un reçu.
 *
 * Partagés par la création et l'édition : une divergence entre les deux
 * formulaires se traduirait par un champ qu'on peut renseigner mais plus
 * corriger.
 *
 * Le numéro n'y figure pas — il est attribué par la base à l'insertion et
 * gelé ensuite. Le proposer à la saisie inviterait à le modifier, ce que
 * PostgreSQL refuse et ce que la comptabilité refuse aussi.
 */
export function ReceiptFields({ receipt }: { receipt?: Receipt }) {
  return (
    <>
      <Field label="Date">
        <Input
          name="issued_on"
          type="date"
          required
          defaultValue={receipt?.issued_on ?? today()}
        />
      </Field>

      <Field label="Reçu de M./Mme">
        <Input
          name="payer"
          required
          maxLength={160}
          placeholder="Konan Yao"
          defaultValue={receipt?.payer}
        />
      </Field>

      <AmountWords
        defaultAmount={receipt?.amount}
        defaultWords={receipt?.amount_in_words}
      />

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Article(s)" hint="L'objet du règlement.">
          <Textarea
            name="articles"
            rows={2}
            maxLength={500}
            placeholder="Fourniture et pose de garde-corps"
            defaultValue={receipt?.articles}
          />
        </Field>
      </div>

      <Field label={`Avance (${CURRENCY_LABEL})`}>
        <Input
          name="advance"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={receipt?.advance || ""}
        />
      </Field>

      <Field label={`Reste (${CURRENCY_LABEL})`}>
        <Input
          name="balance"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={receipt?.balance || ""}
        />
      </Field>

      <Field label="Reçu établi par">
        <Input
          name="issued_by"
          maxLength={120}
          placeholder="Awa Diallo"
          defaultValue={receipt?.issued_by}
        />
      </Field>
    </>
  );
}
