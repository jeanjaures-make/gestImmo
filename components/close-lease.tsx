"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, ErrorText, Input } from "@/components/ui/kit";
import { closeLease } from "@/app/(dashboard)/leases/actions";

/**
 * Clôture d'un bail. La remise du logement en « Libre » n'est pas faite
 * ici : c'est un trigger PostgreSQL qui s'en charge.
 */
export function CloseLease({ leaseId }: { leaseId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await closeLease({}, formData);
      if (result.ok) {
        setError(undefined);
        setOpen(false);
        toast.success("Bail clôturé. Le logement repasse en « Libre ».");
      } else {
        setError(result.error ?? "La clôture a échoué.");
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Clôturer
      </Button>
    );
  }

  return (
    <form action={submit} className="flex flex-col items-end gap-2">
      <input type="hidden" name="lease_id" value={leaseId} />
      <div className="flex items-center gap-2">
        <Input
          name="end_date"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="h-8 w-40"
          aria-label="Date de fin du bail"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Valider"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Annuler
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
