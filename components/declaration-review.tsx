"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/kit";
import { reviewDeclaration } from "@/app/(dashboard)/payments/actions";

/**
 * Accepter ou refuser un règlement déclaré.
 *
 * Accepter écrit en caisse : le libellé du bouton dit donc ce qui se
 * produit (« Encaisser »), pas seulement qu'on est d'accord.
 */
export function DeclarationReview({
  declarationId,
  tenantName,
}: {
  declarationId: string;
  tenantName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function review(accept: boolean) {
    const formData = new FormData();
    formData.set("declaration_id", declarationId);
    formData.set("accept", String(accept));

    startTransition(async () => {
      const result = await reviewDeclaration({}, formData);
      if (result.ok) {
        toast.success(
          accept
            ? `Règlement de ${tenantName} encaissé.`
            : `Déclaration de ${tenantName} refusée.`,
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "L'opération a échoué.");
      }
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => review(false)}
      >
        <X className="size-3.5" />
        Refuser
      </Button>
      <Button size="sm" disabled={pending} onClick={() => review(true)}>
        <Check className="size-3.5" />
        Encaisser
      </Button>
    </div>
  );
}
