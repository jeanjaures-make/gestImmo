"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import { Field, Input, Textarea } from "@/components/ui/kit";
import { amountInWordsWithCurrency } from "@/lib/amount-in-words";
import { CURRENCY_LABEL } from "@/lib/money";

/**
 * Le montant, et sa transcription en toutes lettres.
 *
 * Les deux champs sont solidaires : taper la somme remplit la phrase. Mais
 * la phrase reste modifiable, et une phrase déjà retouchée n'est pas
 * écrasée — c'est la mention qui fait foi sur le papier, elle appartient
 * au rédacteur, pas au convertisseur.
 *
 * La conversion a lieu côté client, à la frappe : attendre l'aller-retour
 * serveur pour voir « deux cent mille francs CFA » apparaître donnerait
 * l'impression d'un champ qui traîne.
 */
export function AmountWords({
  defaultAmount,
  defaultWords,
  amountLabel = `Montant (${CURRENCY_LABEL})`,
  wordsLabel = "Montant en toutes lettres",
}: {
  defaultAmount?: number | string;
  defaultWords?: string;
  amountLabel?: string;
  wordsLabel?: string;
}) {
  const [words, setWords] = useState(defaultWords ?? "");
  // Une phrase saisie à la main cesse de suivre le montant. On mémorise
  // la dernière proposition pour distinguer « l'utilisateur a écrit » de
  // « c'est nous qui avions rempli ».
  const [suggested, setSuggested] = useState(defaultWords ?? "");

  function onAmountChange(value: string) {
    const proposal = amountInWordsWithCurrency(value.replace(",", "."));
    if (words === suggested) setWords(proposal);
    setSuggested(proposal);
  }

  const stale = words !== suggested && suggested !== "";

  return (
    <>
      <Field label={amountLabel}>
        <Input
          name="amount"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          required
          defaultValue={defaultAmount}
          onChange={(event) => onAmountChange(event.target.value)}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field
          label={wordsLabel}
          hint="Proposée d'après le montant, et modifiable — c'est cette phrase qui s'imprime."
        >
          <Textarea
            name="amount_in_words"
            rows={2}
            value={words}
            onChange={(event) => setWords(event.target.value)}
            placeholder="Deux cent mille francs CFA"
          />
        </Field>

        {stale && (
          <button
            type="button"
            onClick={() => setWords(suggested)}
            className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Wand2 className="size-3.5" />
            Remettre la phrase proposée : « {suggested} »
          </button>
        )}
      </div>
    </>
  );
}
