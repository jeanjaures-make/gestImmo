/**
 * Garde des frontières serveur / client.
 *
 *   npm run check:boundaries
 *
 * Deux fautes de ce projet ont motivé ce script. Toutes deux tenaient à la
 * même chose : une valeur placée du mauvais côté de la frontière.
 *
 * 1. `PERIODS` était exporté depuis un module `"use client"` et importé par
 *    le tableau de bord, composant serveur. En production, l'import serveur
 *    d'un module client ne rend pas la valeur mais une référence de module :
 *    `PERIODS.includes(...)` levait « includes is not a function ». Ni le
 *    build, ni TypeScript, ni le mode développement ne le voyaient — la
 *    page d'accueil plantait à chaque chargement en production.
 *
 * 2. Les bornes du logo étaient exportées depuis un fichier `"use server"`,
 *    qui n'accepte que des fonctions asynchrones. Le build le signale, mais
 *    tard : après une minute de compilation.
 *
 * Ce contrôle prend une seconde et tourne avec le lint. Il ne remplace pas
 * le compilateur : il attrape la classe d'erreur que le compilateur laisse
 * passer, et avance celle qu'il signale trop tard.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SCANNED = ["app", "components", "lib"];
const EXTENSIONS = [".ts", ".tsx"];

/** Chemins de fichiers à examiner. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

/** `"use client"` / `"use server"` en tête de fichier, ou rien. */
function directiveOf(source) {
  const head = source.slice(0, 200);
  if (/^\s*(["'])use client\1/.test(head)) return "client";
  if (/^\s*(["'])use server\1/.test(head)) return "server";
  return null;
}

/**
 * Exports de valeurs, hors types.
 *
 * Les composants sont reconnus à leur initiale majuscule : les importer
 * depuis le serveur est le fonctionnement normal de React, ce n'est pas ce
 * qu'on traque. Seules les valeurs ordinaires posent problème.
 */
function valueExports(source) {
  const found = [];
  const patterns = [
    /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+class\s+([A-Za-z_$][\w$]*)/gm,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/**
 * Un composant est en PascalCase : majuscule initiale, au moins une
 * minuscule, aucun tiret bas.
 *
 * La seule initiale majuscule ne suffit pas : elle classerait `PERIODS` et
 * `LOGO_TYPES` parmi les composants — exactement les constantes que ce
 * contrôle doit attraper. C'est l'erreur qu'a commise la première version
 * de ce script, laquelle laissait donc passer le bug qui l'a motivé.
 */
const isComponent = (name) =>
  /^[A-Z]/.test(name) && /[a-z]/.test(name) && !name.includes("_");

/** Résout `@/lib/x` ou `./x` vers un chemin de fichier réel. */
function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = resolve(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(fromFile, "..", specifier);
  else return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Chemin inexistant : on essaie la variante suivante.
    }
  }
  return null;
}

const problems = [];
const files = SCANNED.flatMap((dir) => {
  try {
    return walk(join(ROOT, dir));
  } catch {
    return [];
  }
});

const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

// ── 1. Un fichier « use server » n'exporte que des fonctions asynchrones ──
for (const [file, source] of sources) {
  if (directiveOf(source) !== "server") continue;

  for (const match of source.matchAll(
    /^export\s+(?:(const|let|var|class)\s+([A-Za-z_$][\w$]*)|function\s+([A-Za-z_$][\w$]*))/gm,
  )) {
    const name = match[2] ?? match[3];
    problems.push(
      `${relative(ROOT, file)} — « ${name} » est exporté d'un fichier "use server", ` +
        `qui n'accepte que des fonctions asynchrones.\n` +
        `    Déplacez cette valeur dans un module neutre (voir lib/logo.ts).`,
    );
  }
}

// ── 2. Aucune valeur d'un module « use client » n'est lue par le serveur ──
const clientValues = new Map();
for (const [file, source] of sources) {
  if (directiveOf(source) !== "client") continue;
  const exposed = valueExports(source).filter((n) => !isComponent(n));
  if (exposed.length) clientValues.set(file, new Set(exposed));
}

for (const [file, source] of sources) {
  // Un module client qui en importe un autre reste côté client : rien à dire.
  if (directiveOf(source) === "client") continue;

  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g,
  )) {
    const target = resolveImport(match[2], file);
    if (!target || !clientValues.has(target)) continue;

    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      // `import { type X }` est effacé à la compilation : sans danger.
      if (!name || name.startsWith("type ")) continue;
      if (!clientValues.get(target).has(name)) continue;

      problems.push(
        `${relative(ROOT, file)} — « ${name} » vient de ${relative(ROOT, target)}, ` +
          `marqué "use client".\n` +
          `    Côté serveur, l'import ne rend pas la valeur mais une référence de ` +
          `module : elle est inutilisable, et l'erreur n'apparaît qu'en production.\n` +
          `    Déplacez cette valeur dans un module neutre (voir lib/periods.ts).`,
      );
    }
  }
}

if (problems.length) {
  console.error(`\nFrontières serveur / client — ${problems.length} problème(s) :\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}\n`);
  process.exit(1);
}

console.log(`Frontières serveur / client : ${sources.size} fichiers, rien à signaler.`);
