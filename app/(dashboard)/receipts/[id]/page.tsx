import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PrintButton } from "@/components/print-button";
import { ReceiptSheet } from "@/components/print/receipt-sheet";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Receipt } from "@/lib/types";

export const metadata = { title: "Reçu — CaisseOps" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireSession();
  const { id } = await params;

  const supabase = await createClient();
  // Le RLS suffit à cloisonner : un identifiant appartenant à une autre
  // organisation ne renvoie simplement aucune ligne, donc un 404.
  const { data: receipt } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle<Receipt>();

  if (!receipt) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/receipts"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Tous les reçus
        </Link>
        <PrintButton />
      </div>

      {/* Défilement horizontal sur téléphone : la feuille garde ses
          proportions d'impression plutôt que de se réagencer. Une pièce
          dont l'aperçu diffère du papier ne sert à rien. */}
      <div className="overflow-x-auto pb-2 print:overflow-visible print:pb-0">
        <ReceiptSheet receipt={receipt} organization={organization} />
      </div>
    </div>
  );
}
