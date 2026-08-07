/**
 * Montant en toutes lettres.
 *
 * Sur un reçu ou un bon de caisse, la somme en lettres est la mention qui
 * fait foi : elle est là précisément parce qu'un chiffre se surcharge d'un
 * trait de stylo, pas une phrase. La saisir à la main est fastidieux et
 * fautif — d'où cette conversion, proposée au remplissage du formulaire.
 *
 * Elle reste **modifiable** : le convertisseur propose, le rédacteur
 * dispose. Une pièce déjà remise conserve la formulation qu'elle portait
 * (le texte est stocké en base, pas recalculé à l'affichage).
 *
 * Orthographe retenue : celle de l'usage courant, qui suit les règles
 * traditionnelles plutôt que les rectifications de 1990 — « vingt et un »
 * sans traits d'union, « deux cents » avec accord, « mille » invariable.
 */

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];

const TENS: Record<number, string> = {
  2: "vingt",
  3: "trente",
  4: "quarante",
  5: "cinquante",
  6: "soixante",
};

/**
 * 0 à 99. Là où se logent toutes les irrégularités du français.
 *
 * `bare` supprime le pluriel de « quatre-vingts ». Voir `belowThousand`.
 */
function belowHundred(n: number, bare = false): string {
  if (n < 17) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;

  // Soixante-dix et quatre-vingt-dix se construisent par addition : le
  // français ne nomme ni « septante » ni « nonante ».
  if (n < 70) {
    const ten = TENS[Math.floor(n / 10)];
    const unit = n % 10;
    if (unit === 0) return ten;
    // « et un » sans trait d'union, à l'inverse des autres unités.
    if (unit === 1) return `${ten} et un`;
    return `${ten}-${UNITS[unit]}`;
  }

  if (n < 80) {
    if (n === 71) return "soixante et onze";
    return `soixante-${belowHundred(n - 60)}`;
  }

  // Quatre-vingt-un : pas de « et », contrairement à vingt et un.
  if (n === 80) return bare ? "quatre-vingt" : "quatre-vingts";
  return `quatre-vingt-${belowHundred(n - 80)}`;
}

/**
 * 0 à 999. « Cent » et « vingt » s'accordent multipliés et non suivis.
 *
 * `bare` couvre le cas où le groupe multiplie « mille » : on écrit « deux
 * cent mille » et « quatre-vingt mille », sans s, parce que « mille » est
 * un adjectif numéral et non un nom. Devant « million » et « milliard »,
 * qui sont des noms, l'accord revient — « deux cents millions ». C'est la
 * règle que les convertisseurs oublient le plus souvent, et elle se voit
 * sur la première pièce à six chiffres.
 */
function belowThousand(n: number, bare = false): string {
  if (n < 100) return belowHundred(n, bare);

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const prefix = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent`;

  if (rest === 0) {
    if (hundreds === 1) return "cent";
    return bare ? `${UNITS[hundreds]} cent` : `${UNITS[hundreds]} cents`;
  }
  return `${prefix} ${belowHundred(rest, bare)}`;
}

const SCALES = [
  { value: 1_000_000_000, singular: "milliard", plural: "milliards" },
  { value: 1_000_000, singular: "million", plural: "millions" },
  // « Mille » est invariable et ne se dit jamais « un mille ».
  { value: 1_000, singular: "mille", plural: "mille" },
] as const;

/** Au-delà, la conversion serait fausse : `Number` perd la précision. */
const MAX = 999_999_999_999;

/**
 * Convertit un montant en toutes lettres, sans devise.
 *
 * Les centimes sont écartés : le franc CFA n'a pas de sous-unité en usage,
 * et « zéro centime » sur un reçu appelle des questions plutôt qu'il n'en
 * évite. Le montant est arrondi à l'unité.
 */
export function amountInWords(value: number | string | null | undefined): string {
  const amount = Math.round(Math.abs(Number(value ?? 0)));

  if (!Number.isFinite(amount) || amount > MAX) return "";
  if (amount === 0) return "zéro";

  const parts: string[] = [];
  let rest = amount;

  for (const { value: scale, singular, plural } of SCALES) {
    const count = Math.floor(rest / scale);
    if (count === 0) continue;

    rest %= scale;
    const name = count > 1 ? plural : singular;
    // « mille » seul, mais « un million » : seul le millier se passe de
    // son multiplicateur quand il vaut un.
    parts.push(
      count === 1 && scale === 1_000
        ? name
        : `${belowThousand(count, scale === 1_000)} ${name}`,
    );
  }

  if (rest > 0) parts.push(belowThousand(rest));

  return parts.join(" ");
}

/**
 * La phrase telle qu'elle s'imprime : « deux cent mille francs CFA ».
 *
 * La devise est écrite en toutes lettres elle aussi. « 200 000 F CFA »
 * dans une ligne censée être en lettres annule l'intérêt de la mention.
 */
export function amountInWordsWithCurrency(
  value: number | string | null | undefined,
): string {
  const words = amountInWords(value);
  if (!words) return "";

  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} francs CFA`;
}
