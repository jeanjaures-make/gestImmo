import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PrintButton } from "@/components/print-button";
import { DeliveryNoteSheet } from "@/components/print/delivery-note-sheet";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryNote, DeliveryNoteLine } from "@/lib/types";

export const metadata = { title: "Bon de sortie — CaisseOps" };

export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireSession();
  const { id } = await params;

  const supabase = await createClient();
  // Deux requêtes plutôt qu'une jointure imbriquée : PostgREST n'ordonne pas
  // les lignes embarquées, et l'ordre des articles est celui du papier.
  const [{ data: note }, { data: lines }] = await Promise.all([
    supabase
      .from("delivery_notes")
      .select("*")
      .eq("id", id)
      .maybeSingle<DeliveryNote>(),
    supabase
      .from("delivery_note_lines")
      .select("*")
      .eq("delivery_note_id", id)
      .order("position")
      .returns<DeliveryNoteLine[]>(),
  ]);

  if (!note) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/delivery-notes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Tous les bons de sortie
        </Link>
        <PrintButton />
      </div>

      <div className="overflow-x-auto pb-2 print:overflow-visible print:pb-0">
        <DeliveryNoteSheet
          note={note}
          lines={lines ?? []}
          organization={organization}
        />
      </div>
    </div>
  );
}
