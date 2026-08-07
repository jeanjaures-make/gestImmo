import { describe, expect, it } from "vitest";

import { CSV_BOM, csvFilename, toCsv } from "@/lib/csv";

type Row = { nom: string; montant: number | null };

const columns = [
  { header: "Nom", value: (r: Row) => r.nom },
  { header: "Montant", value: (r: Row) => r.montant },
];

describe("toCsv", () => {
  it("sépare par point-virgule, comme l'attend Excel francophone", () => {
    const csv = toCsv([{ nom: "Diallo", montant: 275000 }], columns);
    expect(csv).toBe("Nom;Montant\r\nDiallo;275000");
  });

  it("écrit les décimales avec une virgule", () => {
    const csv = toCsv([{ nom: "Diallo", montant: 1234.5 }], columns);
    expect(csv).toContain("1234,5");
  });

  it("rend une cellule vide pour une valeur absente", () => {
    const csv = toCsv([{ nom: "Diallo", montant: null }], columns);
    expect(csv).toBe("Nom;Montant\r\nDiallo;");
  });

  it("cite les cellules contenant le séparateur", () => {
    const csv = toCsv([{ nom: "Diallo; Awa", montant: 1 }], columns);
    expect(csv).toContain('"Diallo; Awa"');
  });

  it("double les guillemets internes", () => {
    const csv = toCsv([{ nom: 'Résidence "Vallier"', montant: 1 }], columns);
    expect(csv).toContain('"Résidence ""Vallier"""');
  });

  it("cite les cellules contenant un saut de ligne", () => {
    const csv = toCsv([{ nom: "Ligne 1\nLigne 2", montant: 1 }], columns);
    expect(csv).toContain('"Ligne 1\nLigne 2"');
  });

  /**
   * Le cas qui compte vraiment : Excel exécute une cellule commençant par
   * `=`, `+`, `-` ou `@`. Un nom de payeur est une donnée saisie par un
   * tiers ; sans neutralisation, l'export devient un vecteur d'exécution sur
   * le poste du gestionnaire qui l'ouvre.
   */
  describe("neutralisation des formules", () => {
    for (const amorce of ["=", "+", "-", "@"]) {
      it(`préfixe une cellule commençant par « ${amorce} »`, () => {
        const csv = toCsv(
          [{ nom: `${amorce}HYPERLINK("http://x")`, montant: 1 }],
          columns,
        );
        // L'apostrophe précède la valeur ; le tout est cité car il contient
        // des guillemets.
        expect(csv).toContain(`'${amorce}HYPERLINK`);
      });
    }

    it("laisse intact un nom ordinaire", () => {
      const csv = toCsv([{ nom: "Karim Benali", montant: 1 }], columns);
      expect(csv).toContain("Karim Benali");
      expect(csv).not.toContain("'Karim");
    });

    it("neutralise aussi un en-tête, quelle que soit son origine", () => {
      const csv = toCsv<Row>([], [{ header: "=1+1", value: () => "" }]);
      expect(csv).toBe("'=1+1");
    });
  });

  it("rend l'en-tête seul pour une liste vide", () => {
    expect(toCsv([], columns)).toBe("Nom;Montant");
  });
});

describe("CSV_BOM", () => {
  it("est le caractère U+FEFF, sans lequel Excel casse les accents", () => {
    expect(CSV_BOM).toBe("﻿");
    expect(CSV_BOM).toHaveLength(1);
  });
});

describe("csvFilename", () => {
  const day = new Date().toISOString().slice(0, 10);

  it("compose le nom de l'organisation, le jeu et la date", () => {
    expect(csvFilename("recus", "Travaux Vallier")).toBe(
      `travaux-vallier-recus-${day}.csv`,
    );
  });

  it("retire les accents et la ponctuation", () => {
    expect(csvFilename("bons-de-caisse", "Société Élysée & Cie")).toBe(
      `societe-elysee-cie-bons-de-caisse-${day}.csv`,
    );
  });

  it("retombe sur un nom neutre si l'organisation ne donne rien", () => {
    expect(csvFilename("recus", "…")).toBe(`caisseops-recus-${day}.csv`);
  });

  it("tronque un nom démesuré plutôt que de produire un fichier illisible", () => {
    const name = csvFilename("recus", "A".repeat(120));
    expect(name.length).toBeLessThan(70);
  });
});
