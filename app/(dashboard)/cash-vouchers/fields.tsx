"use client";

import { useState } from "react";

import { AmountWords } from "@/components/amount-words";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/kit";
import {
  CASH_ACCOUNT_LABELS,
  CASH_DIRECTION_LABELS,
  CASH_SETTLEMENT_LABELS,
  CURRENCY_LABEL,
  type CashVoucher,
} from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Les champs d'un bon de caisse.
 *
 * Composant client pour une seule raison : la référence de dépôt n'a de
 * sens qu'en mode « Dépôt ». La laisser visible en permanence invite à la
 * remplir avec une case « Cash » cochée — la base rejette alors la
 * combinaison, et l'utilisateur ne comprend pas pourquoi.
 */
export function CashVoucherFields({ voucher }: { voucher?: CashVoucher }) {
  const [settlement, setSettlement] = useState(voucher?.settlement ?? "cash");

  return (
    <>
      <Field label="Date">
        <Input
          name="issued_on"
          type="date"
          required
          defaultValue={voucher?.issued_on ?? today()}
        />
      </Field>

      <Field label="Sens du mouvement">
        <NativeSelect
          name="direction"
          defaultValue={voucher?.direction ?? "sortie"}
        >
          {Object.entries(CASH_DIRECTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Reçu de M. ou Mme">
        <Input
          name="counterparty"
          required
          maxLength={160}
          placeholder="Konan Yao"
          defaultValue={voucher?.counterparty}
        />
      </Field>

      <AmountWords
        defaultAmount={voucher?.amount}
        defaultWords={voucher?.amount_in_words}
      />

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Motif">
          <Textarea
            name="reason"
            rows={2}
            maxLength={300}
            placeholder="Achat de consommables de soudure"
            defaultValue={voucher?.reason}
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
          defaultValue={voucher?.advance || ""}
        />
      </Field>

      <Field label={`Reste (${CURRENCY_LABEL})`}>
        <Input
          name="balance"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={voucher?.balance || ""}
        />
      </Field>

      <Field label="Ordre donné par">
        <Input
          name="ordered_by"
          maxLength={120}
          placeholder="Direction générale"
          defaultValue={voucher?.ordered_by}
        />
      </Field>

      <Field label="Règlement">
        <NativeSelect
          name="settlement"
          value={settlement}
          onChange={(event) =>
            setSettlement(event.target.value as typeof settlement)
          }
        >
          {Object.entries(CASH_SETTLEMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {settlement === "depot" && (
        <Field label="Référence du dépôt">
          <Input
            name="deposit_ref"
            maxLength={120}
            placeholder="Bordereau nº 4471"
            defaultValue={voucher?.deposit_ref ?? ""}
          />
        </Field>
      )}

      <Field label="Imputation">
        <NativeSelect
          name="account"
          defaultValue={voucher?.account ?? "company"}
        >
          {Object.entries(CASH_ACCOUNT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  );
}
