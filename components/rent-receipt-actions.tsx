"use client";

import { useState, useTransition } from "react";
import { Ban, Check } from "lucide-react";
import { toast } from "sonner";

import {
  cancelRentReceipt,
  issueRentReceipt,
} from "@/app/(dashboard)/rent-receipts/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, ErrorText, Field, Textarea } from "@/components/ui/kit";
import type { RentReceiptStatus } from "@/lib/types";

/**
 * Les deux gestes qui font changer une quittance d'état.
 *
 * Émettre un brouillon, et annuler une quittance émise. Aucune
 * suppression : le déclencheur `guard_rent_receipt` la refuse, et c'est
 * voulu — un numéro qui manque dans un carnet à souche vaut un soupçon.
 * L'annulation, elle, laisse la ligne, sa date et son motif.
 */
export function RentReceiptActions({
  id,
  number,
  status,
  canCancel,
  canIssue,
}: {
  id: string;
  number: string;
  status: RentReceiptStatus;
  canCancel: boolean;
  canIssue: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function issue() {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const result = await issueRentReceipt({}, formData);
      if (result.ok) toast.success(`Quittance ${number} émise.`);
      else toast.error(result.error ?? "L'émission a échoué.");
    });
  }

  function cancel() {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("cancel_reason", reason);
    startTransition(async () => {
      const result = await cancelRentReceipt({}, formData);
      if (result.ok) {
        setOpen(false);
        setError(undefined);
        toast.success(`Quittance ${number} annulée.`);
      } else {
        setError(result.error ?? "L'annulation a échoué.");
      }
    });
  }

  return (
    <>
      {status === "draft" && canIssue && (
        <Button variant="outline" onClick={issue} disabled={pending}>
          <Check className="size-4" />
          Émettre
        </Button>
      )}

      {status !== "cancelled" && canCancel && (
        <Button
          variant="ghost"
          onClick={() => setOpen(true)}
          className="text-destructive"
        >
          <Ban className="size-4" />
          Annuler
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Annuler la quittance {number}</DialogTitle>
            <DialogDescription>
              Elle restera consultable et portera la mention « annulée ». Son
              numéro ne sera pas réattribué — c&apos;est ce qu&apos;un contrôle
              attend d&apos;un carnet à souche.
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Motif de l'annulation"
            hint="Il est conservé, et visible dans le journal d'audit."
          >
            <Textarea
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Erreur de période : la quittance couvrait mars au lieu d'avril."
            />
          </Field>

          <ErrorText>{error}</ErrorText>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Revenir
            </Button>
            <Button
              variant="destructive"
              onClick={cancel}
              disabled={pending || reason.trim() === ""}
            >
              Annuler la quittance
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
