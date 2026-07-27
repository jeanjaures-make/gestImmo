"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/kit";
import { markPaid } from "@/app/(dashboard)/payments/actions";

export function MarkPaid({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await markPaid({}, formData);
      if (result.ok) toast.success("Échéance encaissée.");
      else toast.error(result.error ?? "L'encaissement a échoué.");
    });
  }

  return (
    <form action={submit}>
      <input type="hidden" name="payment_id" value={paymentId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <Check className="size-3.5" />
        {pending ? "…" : "Encaisser"}
      </Button>
    </form>
  );
}
