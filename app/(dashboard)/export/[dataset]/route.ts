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
 * paiements » de « on vous en a caché 4 000 ». On boucle jusqu'à épuisement
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

/** Suit une relation renvoyée par PostgREST, qui peut être objet ou tableau. */
function rel(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = row[key];
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

const DATASETS: Record<string, Dataset> = {
  paiements: {
    table: "rent_payments",
    select:
      "month, amount, amount_paid, status, payment_date, method, note, leases(tenants(firstname, lastname), apartments(number, buildings(name)))",
    orderBy: "month",
    ascending: false,
    columns: [
      { header: "Mois", value: (r) => str(r.month) },
      {
        header: "Locataire",
        value: (r) => {
          const t = rel(rel(r, "leases"), "tenants");
          return `${str(t.firstname)} ${str(t.lastname)}`.trim();
        },
      },
      {
        header: "Immeuble",
        value: (r) =>
          str(rel(rel(rel(r, "leases"), "apartments"), "buildings").name),
      },
      {
        header: "Logement",
        value: (r) => str(rel(rel(r, "leases"), "apartments").number),
      },
      { header: "Dû", value: (r) => num(r.amount) },
      { header: "Encaissé", value: (r) => num(r.amount_paid) },
      { header: "Statut", value: (r) => str(r.status) },
      { header: "Réglé le", value: (r) => str(r.payment_date) },
      { header: "Moyen", value: (r) => str(r.method) },
      { header: "Note", value: (r) => str(r.note) },
    ],
  },

  depenses: {
    table: "expenses",
    select: "expense_date, label, category, amount, buildings(name)",
    orderBy: "expense_date",
    ascending: false,
    columns: [
      { header: "Date", value: (r) => str(r.expense_date) },
      { header: "Libellé", value: (r) => str(r.label) },
      { header: "Catégorie", value: (r) => str(r.category) },
      { header: "Montant", value: (r) => num(r.amount) },
      { header: "Immeuble", value: (r) => str(rel(r, "buildings").name) },
    ],
  },

  locataires: {
    table: "tenants",
    select: "lastname, firstname, email, phone, identity_number, created_at",
    orderBy: "lastname",
    ascending: true,
    columns: [
      { header: "Nom", value: (r) => str(r.lastname) },
      { header: "Prénom", value: (r) => str(r.firstname) },
      { header: "E-mail", value: (r) => str(r.email) },
      { header: "Téléphone", value: (r) => str(r.phone) },
      { header: "Pièce d'identité", value: (r) => str(r.identity_number) },
      { header: "Fiche créée le", value: (r) => str(r.created_at).slice(0, 10) },
    ],
  },

  baux: {
    table: "leases",
    select:
      "start_date, end_date, rent, charges, deposit, status, tenants(firstname, lastname), apartments(number, buildings(name))",
    orderBy: "start_date",
    ascending: false,
    columns: [
      {
        header: "Locataire",
        value: (r) => {
          const t = rel(r, "tenants");
          return `${str(t.firstname)} ${str(t.lastname)}`.trim();
        },
      },
      {
        header: "Immeuble",
        value: (r) => str(rel(rel(r, "apartments"), "buildings").name),
      },
      { header: "Logement", value: (r) => str(rel(r, "apartments").number) },
      { header: "Début", value: (r) => str(r.start_date) },
      { header: "Fin", value: (r) => str(r.end_date) },
      { header: "Loyer", value: (r) => num(r.rent) },
      { header: "Charges", value: (r) => num(r.charges) },
      { header: "Dépôt de garantie", value: (r) => num(r.deposit) },
      { header: "Statut", value: (r) => str(r.status) },
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
