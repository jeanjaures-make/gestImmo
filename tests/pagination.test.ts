import { describe, expect, it } from "vitest";

import { isOutOfRange, pageCount, readPage, PAGE_SIZE } from "@/lib/pagination";
import { readPeriod } from "@/lib/periods";

/**
 * Les bornes de pagination.
 *
 * Elles viennent de l'URL, donc de l'extérieur. Une valeur absurde ne doit
 * produire ni erreur ni écran vide inexplicable : c'est ce qui distingue
 * une liste robuste d'une liste qui se casse dès qu'on modifie l'adresse.
 */
describe("lecture du numéro de page", () => {
  it("part de la première page en l'absence de paramètre", () => {
    const page = readPage(undefined);
    expect(page.number).toBe(1);
    expect(page.from).toBe(0);
    expect(page.to).toBe(PAGE_SIZE - 1);
  });

  it("calcule des bornes contiguës, sans trou ni recouvrement", () => {
    const first = readPage("1");
    const second = readPage("2");
    expect(second.from).toBe(first.to + 1);
  });

  it.each(["0", "-3", "abc", "", "1.9", "NaN"])(
    "retombe sur la première page pour une valeur absurde (%s)",
    (value) => {
      expect(readPage(value).number).toBe(1);
    },
  );

  it("accepte un très grand numéro sans déborder", () => {
    const page = readPage("1000000");
    expect(page.number).toBe(1_000_000);
    expect(Number.isSafeInteger(page.from)).toBe(true);
  });
});

describe("nombre de pages", () => {
  it("vaut 1 pour une liste vide, pour rester lisible", () => {
    expect(pageCount(0)).toBe(1);
  });

  it("ne crée pas de page supplémentaire sur un compte exact", () => {
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });
});

describe("page hors limites", () => {
  it("détecte une page vidée par une suppression", () => {
    expect(isOutOfRange(readPage("3"), 10)).toBe(true);
  });

  it("ne signale rien sur une liste vide : il n'y a rien à dépasser", () => {
    expect(isOutOfRange(readPage("1"), 0)).toBe(false);
  });
});

describe("période du tableau de bord", () => {
  // Cette fonction existe parce que `PERIODS`, exporté d'un module client,
  // n'était pas un tableau côté serveur en production.
  it("accepte les périodes proposées", () => {
    expect(readPeriod("6")).toBe(6);
    expect(readPeriod("24")).toBe(24);
  });

  it("retombe sur douze mois pour toute autre valeur", () => {
    expect(readPeriod("7")).toBe(12);
    expect(readPeriod(undefined)).toBe(12);
    expect(readPeriod("../etc/passwd")).toBe(12);
  });
});
