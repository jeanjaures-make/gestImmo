import Link from "next/link";
import { Printer } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import { RowActions } from "@/components/row-actions";
import { PageHeader } from "@/components/ui/kit";
import { canDelete, canIssue, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  formatDate,
  type DeliveryNote,
  type DeliveryNoteLine,
} from "@/lib/types";
import { createDeliveryNote, updateDeliveryNote } from "./actions";
import { DeliveryNoteFields } from "./fields";

export const metadata = { title: "Bons de sortie — CaisseOps" };

/** Le bon et ses articles : le formulaire de correction a besoin des deux. */
type NoteWithLines = DeliveryNote & {
  delivery_note_lines: DeliveryNoteLine[];
};

export default async function DeliveryNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);

  const supabase = await createClient();
  // Les lignes sont chargées avec le bon : sans elles, ouvrir « Modifier »
  // afficherait un tableau vide et l'enregistrement effacerait les articles.
  const { data, count } = await supabase
    .from("delivery_notes")
    .select("*, delivery_note_lines(*)", { count: "exact" })
    .order("issued_on", { ascending: false })
    .order("number", { ascending: false })
    .range(page.from, page.to)
    .returns<NoteWithLines[]>();

  const notes = (data ?? []).map((note) => ({
    ...note,
    // PostgREST ne garantit pas l'ordre des lignes imbriquées : on rétablit
    // celui du papier.
    delivery_note_lines: [...note.delivery_note_lines].sort(
      (a, b) => a.position - b.position,
    ),
  }));

  const editable = canIssue(profile.role);
  const removable = canDelete(profile.role);

  const fields: RecordField<NoteWithLines>[] = [
    {
      label: "Numéro",
      role: "title",
      value: (n) => (
        <Link href={`/delivery-notes/${n.id}`} className="hover:underline">
          {n.number}
        </Link>
      ),
    },
    { label: "Émetteur", role: "subtitle", value: (n) => n.issuer },
    { label: "Date", value: (n) => formatDate(n.issued_on) },
    { label: "Service", value: (n) => n.service || "—" },
    {
      label: "Articles",
      numeric: true,
      value: (n) => String(n.delivery_note_lines.length),
    },
    {
      label: "Destinations",
      role: "hidden",
      value: (n) =>
        [
          ...new Set(
            n.delivery_note_lines.map((line) => line.destination).filter(Boolean),
          ),
        ].join(", ") || "—",
    },
  ];

  return (
    <>
      <PageHeader
        title="Bons de sortie"
        description="Ce qui quitte le magasin : les articles, leur quantité et leur destination."
        action={<ExportButton dataset="bons-de-sortie" />}
      />

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouveau bon de sortie"
            triggerLabel="Nouveau bon de sortie"
            submitLabel="Émettre le bon"
            successMessage="Bon de sortie émis."
            action={createDeliveryNote}
          >
            <DeliveryNoteFields />
          </EntityForm>
        </div>
      )}

      <RecordList
        caption="Bons de sortie émis"
        items={notes}
        keyOf={(n) => n.id}
        fields={fields}
        empty="Aucun bon de sortie émis pour l'instant."
        actions={(note) => (
          <>
            <Link
              href={`/delivery-notes/${note.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Printer className="size-3.5" />
              Imprimer
            </Link>
            {editable && (
              <RowActions
                entityLabel="Bon de sortie"
                editTitle={`Modifier le bon ${note.number}`}
                editAction={updateDeliveryNote}
                editFields={
                  <DeliveryNoteFields
                    note={note}
                    lines={note.delivery_note_lines}
                  />
                }
                deleteTable="delivery_notes"
                deleteId={note.id}
                canDelete={removable}
                deleteDescription={`Le bon ${note.number} et ses articles seront définitivement supprimés. Son numéro ne sera pas réattribué : la numérotation gardera un trou, visible lors d'un contrôle.`}
              />
            )}
          </>
        )}
      />

      <Pagination
        page={page.number}
        size={page.size}
        total={count ?? 0}
        unit="bons de sortie"
      />
    </>
  );
}
