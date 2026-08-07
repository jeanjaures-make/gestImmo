import { describe, expect, it } from "vitest";

import {
  amountInWords,
  amountInWordsWithCurrency,
} from "@/lib/amount-in-words";

/**
 * La somme en lettres est la mention qui fait foi sur une pièce de caisse.
 *
 * Elle est proposée par le convertisseur puis stockée telle quelle : une
 * erreur de conversion ne se corrige plus après remise de l'exemplaire au
 * client. D'où ces cas — ce sont les irrégularités du français qui cassent
 * les convertisseurs, pas les nombres ronds.
 */

describe("irrégularités du français", () => {
  it("écrit les nombres en dessous de vingt", () => {
    expect(amountInWords(0)).toBe("zéro");
    expect(amountInWords(16)).toBe("seize");
    expect(amountInWords(17)).toBe("dix-sept");
  });

  it("accorde « et un » sans trait d'union", () => {
    expect(amountInWords(21)).toBe("vingt et un");
    expect(amountInWords(22)).toBe("vingt-deux");
    expect(amountInWords(31)).toBe("trente et un");
  });

  it("construit soixante-dix par addition, le français n'ayant pas de septante", () => {
    expect(amountInWords(70)).toBe("soixante-dix");
    expect(amountInWords(71)).toBe("soixante et onze");
    expect(amountInWords(77)).toBe("soixante-dix-sept");
  });

  it("accorde quatre-vingts, sauf suivi d'une unité", () => {
    expect(amountInWords(80)).toBe("quatre-vingts");
    expect(amountInWords(81)).toBe("quatre-vingt-un");
    expect(amountInWords(91)).toBe("quatre-vingt-onze");
  });

  it("accorde « cent » multiplié mais non suivi", () => {
    expect(amountInWords(100)).toBe("cent");
    expect(amountInWords(200)).toBe("deux cents");
    expect(amountInWords(201)).toBe("deux cent un");
  });

  it("laisse « mille » invariable et sans multiplicateur à un", () => {
    expect(amountInWords(1_000)).toBe("mille");
    expect(amountInWords(2_000)).toBe("deux mille");
    expect(amountInWords(200_000)).toBe("deux cent mille");
  });

  it("accorde million et milliard, qui sont des noms", () => {
    expect(amountInWords(1_000_000)).toBe("un million");
    expect(amountInWords(2_000_000)).toBe("deux millions");
    expect(amountInWords(1_000_000_000)).toBe("un milliard");
  });
});

describe("montants réels", () => {
  it("compose les échelles dans l'ordre décroissant", () => {
    expect(amountInWords(1_234_567)).toBe(
      "un million deux cent trente-quatre mille cinq cent soixante-sept",
    );
  });

  it("arrondit les centimes, que le franc CFA n'emploie pas", () => {
    // « zéro centime » sur un reçu appelle des questions plutôt qu'il n'en
    // évite : la base garde deux décimales, la mention en lettres non.
    expect(amountInWords(250_000.4)).toBe("deux cent cinquante mille");
    expect(amountInWords("1234,56".replace(",", "."))).toBe(
      "mille deux cent trente-cinq",
    );
  });

  it("traite l'absence de montant comme zéro plutôt que de lever", () => {
    expect(amountInWords(null)).toBe("zéro");
    expect(amountInWords(undefined)).toBe("zéro");
  });

  it("rend une chaîne vide au-delà de ce qu'il sait convertir", () => {
    // Mieux vaut ne rien proposer qu'une phrase fausse que le caissier
    // recopierait sans la vérifier.
    expect(amountInWords(1e15)).toBe("");
    expect(amountInWords(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("phrase imprimée", () => {
  it("capitalise et écrit la devise en lettres", () => {
    expect(amountInWordsWithCurrency(200_000)).toBe(
      "Deux cent mille francs CFA",
    );
  });

  it("ne propose rien quand la conversion a échoué", () => {
    expect(amountInWordsWithCurrency(1e15)).toBe("");
  });
});
