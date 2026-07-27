"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, X } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  ErrorText,
  Field,
  Input,
  NativeSelect,
} from "@/components/ui/kit";
import { declarePayment } from "@/app/portal/payments/actions";
import { PAYMENT_METHODS } from "@/lib/types";

/**
 * Déclaration d'un règlement, dépliée dans la carte de l'échéance.
 *
 * Pas de modale : sur téléphone, une boîte de dialogue recouvre le montant
 * que l'on est venu régler et déplace le clavier. Le panneau s'ouvre à sa
 * place, le contexte reste sous les yeux.
 */
export function DeclarePayment({
  paymentId,
  remaining,
  today,
}: {
  paymentId: string;
  remaining: number;
  /** Date du jour calculée côté serveur : le client peut être mal réglé. */
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await declarePayment({}, formData);
      if (result.ok) {
        setError(undefined);
        setOpen(false);
        toast.success("Déclaration envoyée à votre gestionnaire.");
        router.refresh();
      } else {
        setError(result.error ?? "L'envoi a échoué.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/40 text-sm font-medium text-primary active:bg-primary/10"
      >
        <BadgeCheck className="size-4" />
        J&apos;ai réglé cette échéance
      </button>
    );
  }

  return (
    <form action={submit} className="mt-3 flex flex-col gap-3 border-t pt-3">
      <input type="hidden" name="rent_payment_id" value={paymentId} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Déclarer mon règlement</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer"
          className="flex size-11 cursor-pointer items-center justify-center text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <Field label="Montant réglé (€)">
        <Input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          max={remaining}
          defaultValue={remaining}
          className="h-12 text-base"
          required
        />
      </Field>

      <Field label="Date du règlement">
        <Input
          name="paid_on"
          type="date"
          max={today}
          defaultValue={today}
          className="h-12 text-base"
          required
        />
      </Field>

      <Field label="Moyen de paiement">
        <NativeSelect
          name="method"
          defaultValue={PAYMENT_METHODS[0]}
          className="h-12 text-base"
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Référence" hint="N° de virement, de chèque… (facultatif)">
        <Input name="reference" className="h-12 text-base" />
      </Field>

      <ErrorText>{error}</ErrorText>

      <p className="text-xs text-muted-foreground">
        Votre gestionnaire vérifiera ce règlement avant de l&apos;enregistrer.
        Vous serez notifié dès qu&apos;il sera confirmé.
      </p>

      <Button type="submit" size="lg" className="min-h-12" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer la déclaration"}
      </Button>
    </form>
  );
}
