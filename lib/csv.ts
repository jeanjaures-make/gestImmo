/**
 * Sérialisation CSV destinée à Excel francophone.
 *
 * Trois détails décident si le fichier s'ouvre correctement ou s'ouvre en
 * bouillie, et aucun n'est deviné par l'utilisateur qui double-clique :
 *
 *  • Le séparateur est le point-virgule. Excel configuré en français lit la
 *    virgule comme un séparateur décimal : un fichier séparé par virgules
 *    s'affiche entièrement dans la première colonne.
 *  • Les décimales s'écrivent avec une virgule, pour la même raison. Un
 *    « 275000.50 » se lirait comme du texte, et aucune somme ne
 *    fonctionnerait dessus.
 *  • Le fichier commence par un BOM UTF-8. Sans lui, Excel suppose l'encodage
 *    régional et « Diallo » devient « Ã©chéance » : les accents décident donc
 *    de la lisibilité de tout le fichier.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

const SEPARATOR = ";";

/**
 * Neutralise les cellules interprétées comme formules.
 *
 * Excel, LibreOffice et Google Sheets exécutent le contenu d'une cellule qui
 * commence par `=`, `+`, `-` ou `@`. Un payeur nommé `=cmd|…` deviendrait
 * une commande exécutée sur le poste du gestionnaire qui ouvre l'export.
 * Le préfixe apostrophe force l'interprétation en texte ; il est invisible
 * dans la cellule.
 */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escape(value: string): string {
  const safe = neutralize(value);
  // Guillemets, séparateur ou saut de ligne : la cellule doit être citée, et
  // les guillemets internes doublés.
  return /["\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function render(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value).replace(".", ",") : "";
  }
  return escape(value);
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escape(c.header)).join(SEPARATOR)];

  for (const row of rows) {
    lines.push(columns.map((c) => render(c.value(row))).join(SEPARATOR));
  }

  // CRLF : la fin de ligne attendue par Excel sous Windows.
  return lines.join("\r\n");
}

/** Le BOM, sans lequel les accents sont illisibles dans Excel. */
export const CSV_BOM = "\uFEFF";

/**
 * Nom de fichier sûr, daté.
 *
 * Le nom de l'organisation y figure : un gestionnaire qui exporte plusieurs
 * portefeuilles se retrouve sinon avec quatre `paiements.csv` dans son
 * dossier de téléchargements.
 */
export function csvFilename(dataset: string, organization: string): string {
  const slug = organization
    .normalize("NFD")
    // Les diacritiques, isolés par NFD, s'écrivent par leur code : le même
    // intervalle tapé littéralement est invisible à la relecture.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const day = new Date().toISOString().slice(0, 10);
  return `${slug || "caisseops"}-${dataset}-${day}.csv`;
}
