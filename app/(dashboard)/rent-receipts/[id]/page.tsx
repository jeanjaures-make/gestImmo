import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PrintButton } from "@/components/print-button";
import { RentReceiptSheet } from "@/components/print/rent-receipt-sheet";
import { RentReceiptActions } from "@/components/rent-receipt-actions";
import { canDelete, canIssue, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, type RentReceipt } from "@/lib/types";

export const metadata = { title: "Quittance — CaisseOps" };

export default async function RentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization, profile } = await requireSession();
  const { id } = await params;

  const supabase = await createClient();
  // Le RLS suffit à cloisonner : un identifiant appartenant à une autre
  // organisation ne renvoie aucune ligne, donc un 404.
  const { data: receipt } = await supabase
    .from("rent_receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle<RentReceipt>();

  if (!receipt) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/rent-receipts"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Toutes les quittances
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <RentReceiptActions
            id={receipt.id}
            number={receipt.number}
            status={receipt.status}
            canCancel={canDelete(profile.role)}
            canIssue={canIssue(profile.role)}
          />
          <PrintButton />
        </div>
      </div>

      {receipt.status === "cancelled" && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm print:hidden">
          <strong>Quittance annulée</strong>
          {receipt.cancelled_at && ` le ${formatDate(receipt.cancelled_at)}`}
          {receipt.cancel_reason && ` — ${receipt.cancel_reason}`}
        </p>
      )}

      {/* Défilement horizontal sur téléphone : la feuille garde ses
          proportions d'impression plutôt que de se réagencer. Une pièce
          dont l'aperçu diffère du papier ne sert à rien. */}
      <div className="overflow-x-auto pb-2 print:overflow-visible print:pb-0">
        <RentReceiptSheet receipt={receipt} organization={organization} />
      </div>
    </div>
  );
}
