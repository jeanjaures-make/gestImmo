import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth";
import { CSV_BOM, csvFilename, toCsv, type CsvColumn } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Export CSV des listes du back-office.
 *
 * ─── Pourquoi une route et non une Server Action ────────────────────────
 * Une Server Action renvoie des données à React ; ici on veut que le
 * navigateur déclenche un téléchargement. Un simple lien vers cette route
 * suffit, et fonctionne sans JavaScript.
 *
 * ─── Pourquoi on pagine alors qu'on veut tout ───────────────────────────
 * PostgREST plafonne le nombre de lignes par réponse. Une requête unique
 * rendrait donc un fichier tronqué — silencieusement, ce qui est le pire
 * cas pour un export comptable : rien ne distingue « il n'y a que 1 000
 * reçus » de « on vous en a caché 4 000 ». On boucle jusqu'à épuisement
 * et le nombre de lignes est annoncé dans un en-tête de réponse.
 */
const CHUNK = 1000;

/** Sécurité : au-delà, on préfère refuser que de faire tomber le serveur. */
const MAX_ROWS = 100_000;

type Dataset = {
  /** Table interrogée. */
  table: string;
  /** Colonnes à demander à PostgREST. */
  select: string;
  /** Tri, pour que deux exports successifs se comparent. */
  orderBy: string;
  ascending?: boolean;
  columns: CsvColumn<Record<string, unknown>>[];
};

const str = (v: unknown) => (v == null ? "" : String(v));

/**
 * PostgREST rend les colonnes NUMERIC sous forme de chaîne pour préserver la
 * précision. Les renvoyer telles quelles produirait des cellules texte, sur
 * lesquelles aucune somme ne fonctionne — le défaut le plus visible d'un
 * export destiné à un comptable.
 */
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Les lignes d'un bon de sortie, telles que PostgREST les imbrique. */
function lines(row: Record<string, unknown>): Record<string, unknown>[] {
  const value = row.delivery_note_lines;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

const DATASETS: Record<string, Dataset> = {
  recus: {
    table: "receipts",
    select:
      "number, issued_on, payer, amount, advance, balance, articles, issued_by, created_at",
    orderBy: "issued_on",
    ascending: false,
    columns: [
      { header: "Numéro", value: (r) => str(r.number) },
      { header: "Date", value: (r) => str(r.issued_on) },
      { header: "Reçu de", value: (r) => str(r.payer) },
      { header: "Montant", value: (r) => num(r.amount) },
      { header: "Avance", value: (r) => num(r.advance) },
      { header: "Reste", value: (r) => num(r.balance) },
      { header: "Article(s)", value: (r) => str(r.articles) },
      { header: "Établi par", value: (r) => str(r.issued_by) },
      { header: "Émis le", value: (r) => str(r.created_at).slice(0, 10) },
    ],
  },

  "bons-de-caisse": {
    table: "cash_vouchers",
    select:
      "number, issued_on, direction, counterparty, amount, advance, balance, reason, ordered_by, settlement, deposit_ref, account, created_at",
    orderBy: "issued_on",
    ascending: false,
    columns: [
      { header: "Numéro", value: (r) => str(r.number) },
      { header: "Date", value: (r) => str(r.issued_on) },
      { header: "Sens", value: (r) => str(r.direction) },
      { header: "Bénéficiaire", value: (r) => str(r.counterparty) },
      { header: "Montant", value: (r) => num(r.amount) },
      { header: "Avance", value: (r) => num(r.advance) },
      { header: "Reste", value: (r) => num(r.balance) },
      { header: "Motif", value: (r) => str(r.reason) },
      { header: "Ordre donné par", value: (r) => str(r.ordered_by) },
      { header: "Règlement", value: (r) => str(r.settlement) },
      { header: "Référence du dépôt", value: (r) => str(r.deposit_ref) },
      { header: "Imputation", value: (r) => str(r.account) },
      { header: "Émis le", value: (r) => str(r.created_at).slice(0, 10) },
    ],
  },

  // Une ligne par bon, et non par article : le fichier suit la pièce telle
  // qu'elle a été remise. Les articles y tiennent en une cellule, séparés
  // par des points-virgules — un tableur les redécoupe si besoin.
  "bons-de-sortie": {
    table: "delivery_notes",
    select:
      "number, issued_on, issuer, service, nota, created_at, delivery_note_lines(position, designation, quantity, destination, observations)",
    orderBy: "issued_on",
    ascending: false,
    columns: [
      { header: "Numéro", value: (r) => str(r.number) },
      { header: "Date", value: (r) => str(r.issued_on) },
      { header: "Émetteur", value: (r) => str(r.issuer) },
      { header: "Service", value: (r) => str(r.service) },
      { header: "Nombre d'articles", value: (r) => lines(r).length },
      {
        header: "Articles",
        value: (r) =>
          lines(r)
            .sort((a, b) => Number(a.position) - Number(b.position))
            .map((line) =>
              [str(line.designation), str(line.quantity)]
                .filter(Boolean)
                .join(" × "),
            )
            .join(" ; "),
      },
      {
        header: "Destinations",
        value: (r) =>
          [
            ...new Set(
              lines(r)
                .map((line) => str(line.destination))
                .filter(Boolean),
            ),
          ].join(" ; "),
      },
      { header: "Nota", value: (r) => str(r.nota) },
      { header: "Émis le", value: (r) => str(r.created_at).slice(0, 10) },
    ],
  },
};

async function fetchAll(
  supabase: SupabaseClient,
  dataset: Dataset,
): Promise<Record<string, unknown>[] | { error: string }> {
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    const { data, error } = await supabase
      .from(dataset.table)
      .select(dataset.select)
      .order(dataset.orderBy, { ascending: dataset.ascending ?? true })
      .range(from, from + CHUNK - 1);

    if (error) return { error: error.message };
    if (!data?.length) break;

    rows.push(...(data as unknown as Record<string, unknown>[]));
    // Une tranche incomplète signifie qu'on a atteint la fin.
    if (data.length < CHUNK) break;
  }

  return rows;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> },
) {
  // Le RLS cloisonne déjà par organisation ; cette garde donne en plus une
  // redirection propre plutôt qu'un fichier vide.
  const session = await requireSession();

  const { dataset: name } = await params;
  const dataset = DATASETS[name];
  if (!dataset) {
    return NextResponse.json({ error: "Export inconnu." }, { status: 404 });
  }

  const supabase = await createClient();
  const result = await fetchAll(supabase, dataset);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const body = CSV_BOM + toCsv(result, dataset.columns);
  const filename = csvFilename(name, session.organization.name);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Le nombre de lignes est vérifiable sans ouvrir le fichier — utile
      // pour prouver qu'aucune donnée n'a été perdue en route.
      "X-Row-Count": String(result.length),
      "Cache-Control": "no-store",
    },
  });
}
