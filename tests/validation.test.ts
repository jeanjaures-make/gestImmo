import { describe, expect, it } from "vitest";

import {
  cashVoucherSchema,
  deliveryNoteSchema,
  formDataToObject,
  readDeliveryLines,
  receiptSchema,
} from "@/lib/validation";

/**
 * Les schémas Zod sont le premier filtre de toute Server Action.
 *
 * Ils sont testés ici parce qu'ils décident de ce qui entre en base, et
 * qu'une règle qui se relâche en silence — un montant vide traité comme
 * zéro, une référence de dépôt conservée sur un règlement en espèces — ne
 * se voit qu'en comptabilité, des mois plus tard.
 */

/** Reproduit ce qu'un formulaire HTML envoie : toutes les valeurs en texte. */
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return formDataToObject(data);
}

const receipt = {
  issued_on: "2026-03-12",
  payer: "Awa Diallo",
  amount: "250000",
};

const voucher = {
  issued_on: "2026-03-12",
  counterparty: "Awa Diallo",
  amount: "250000",
};

describe("montants", () => {
  it("accepte la virgule décimale, usuelle en français", () => {
    const parsed = receiptSchema.safeParse(
      form({ ...receipt, amount: "1234,56" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amount).toBe(1234.56);
  });

  it("refuse un montant vide au lieu de le lire comme zéro", () => {
    // C'est le point délicat : `Number("")` vaut 0. Un reçu au montant
    // laissé vide deviendrait un reçu de zéro franc, sans que personne ne
    // le remarque avant que le payeur ne le conteste.
    const parsed = receiptSchema.safeParse(form({ ...receipt, amount: "" }));
    expect(parsed.success).toBe(false);
  });

  it("refuse un montant négatif", () => {
    const parsed = receiptSchema.safeParse(form({ ...receipt, amount: "-1" }));
    expect(parsed.success).toBe(false);
  });

  it("lit une avance vide comme zéro, pas comme inconnue", () => {
    // Contrairement au montant principal : sur le papier, la case « avance »
    // laissée blanche se lit « rien versé ». La colonne est NOT NULL.
    const parsed = receiptSchema.safeParse(
      form({ ...receipt, advance: "", balance: "" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.advance).toBe(0);
      expect(parsed.data.balance).toBe(0);
    }
  });
});

describe("reçu", () => {
  it("exige un payeur non vide malgré les espaces", () => {
    const parsed = receiptSchema.safeParse(form({ ...receipt, payer: "   " }));
    expect(parsed.success).toBe(false);
  });

  it("refuse une date qui n'est pas au format ISO", () => {
    const parsed = receiptSchema.safeParse(
      form({ ...receipt, issued_on: "12/03/2026" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rend les champs facultatifs en chaîne vide, pas en null", () => {
    // Les colonnes sont NOT NULL DEFAULT '' : une ligne de pointillés vide
    // sur le papier n'est pas une valeur inconnue.
    const parsed = receiptSchema.safeParse(form(receipt));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.articles).toBe("");
      expect(parsed.data.issued_by).toBe("");
      expect(parsed.data.amount_in_words).toBe("");
    }
  });
});

describe("bon de caisse", () => {
  it("sort par défaut, sens le plus courant", () => {
    const parsed = cashVoucherSchema.safeParse(form(voucher));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.direction).toBe("sortie");
      expect(parsed.data.settlement).toBe("cash");
      expect(parsed.data.account).toBe("company");
    }
  });

  it("écarte la référence de dépôt quand le règlement est en espèces", () => {
    // Le formulaire garde la valeur saisie si l'on rebascule sur « Cash » :
    // sans ce nettoyage, la contrainte PostgreSQL rejetterait l'insertion
    // avec un message que l'utilisateur ne peut pas relier à son geste.
    const parsed = cashVoucherSchema.safeParse(
      form({ ...voucher, settlement: "cash", deposit_ref: "VIR-8891" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.deposit_ref).toBeNull();
  });

  it("conserve la référence quand c'est bien un dépôt", () => {
    const parsed = cashVoucherSchema.safeParse(
      form({ ...voucher, settlement: "depot", deposit_ref: "VIR-8891" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.deposit_ref).toBe("VIR-8891");
  });

  it("refuse un sens hors des deux valeurs prévues", () => {
    const parsed = cashVoucherSchema.safeParse(
      form({ ...voucher, direction: "annulation" }),
    );
    expect(parsed.success).toBe(false);
  });
});

describe("bon de sortie", () => {
  const note = { issued_on: "2026-03-12", issuer: "Awa Diallo" };

  it("exige un émetteur", () => {
    const parsed = deliveryNoteSchema.safeParse(form({ ...note, issuer: "" }));
    expect(parsed.success).toBe(false);
  });

  /** Les quatre colonnes voyagent en listes parallèles dans le FormData. */
  function lines(rows: string[][]) {
    const data = new FormData();
    for (const [designation, quantity, destination, observations] of rows) {
      data.append("designation", designation);
      data.append("quantity", quantity ?? "");
      data.append("destination", destination ?? "");
      data.append("observations", observations ?? "");
    }
    return readDeliveryLines(data);
  }

  it("recompose les lignes dans l'ordre de saisie", () => {
    const parsed = lines([
      ["Tôles galvanisées", "12", "Chantier Koumassi", ""],
      ["Ciment", "40 sacs", "Magasin 2", "Palettes consignées"],
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].designation).toBe("Tôles galvanisées");
      expect(parsed.data[1].quantity).toBe("40 sacs");
    }
  });

  it("ignore les lignes entièrement vides", () => {
    // Le formulaire en propose trois d'avance : l'utilisateur n'a pas à
    // effacer celles qu'il n'a pas remplies.
    const parsed = lines([
      ["Ciment", "40 sacs", "", ""],
      ["", "", "", ""],
      ["", "", "", ""],
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toHaveLength(1);
  });

  it("refuse un bon sans aucun article", () => {
    // Une pièce vide qui circulerait porterait un numéro pour rien.
    const parsed = lines([["", "", "", ""]]);
    expect(parsed.success).toBe(false);
  });

  it("refuse une quantité sans désignation", () => {
    const parsed = lines([["", "40 sacs", "", ""]]);
    expect(parsed.success).toBe(false);
  });
});
