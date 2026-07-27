import { describe, expect, it } from "vitest";

import {
  activeLease,
  effectivePaymentStatus,
  nextDuePayment,
  totalOutstanding,
} from "@/lib/rent";
import type { PaymentStatus } from "@/lib/types";

/**
 * Ce que le locataire lit sur son écran d'accueil : combien il doit, et
 * s'il est en retard. Deux chiffres qui engagent une relation
 * contractuelle — d'où des tests plutôt qu'une relecture.
 */

const echeance = (
  month: string,
  status: PaymentStatus,
  amount = 1000,
  amount_paid = 0,
) => ({ month, status, amount, amount_paid });

describe("statut effectif d'une échéance", () => {
  // Date de référence figée : sinon le test dirait des choses différentes
  // selon le jour où on le lance.
  const enJuin = new Date("2026-06-15T12:00:00Z");

  it("passe en retard une fois le mois révolu", () => {
    expect(effectivePaymentStatus(echeance("2026-04-01", "pending"), enJuin)).toBe(
      "late",
    );
  });

  it("reste « à encaisser » pendant le mois courant", () => {
    expect(effectivePaymentStatus(echeance("2026-06-01", "pending"), enJuin)).toBe(
      "pending",
    );
  });

  it("ne requalifie jamais une échéance déjà soldée", () => {
    expect(effectivePaymentStatus(echeance("2020-01-01", "paid"), enJuin)).toBe(
      "paid",
    );
  });

  it("laisse un paiement partiel à « partiel », même ancien", () => {
    // Le requalifier en retard effacerait l'information qu'un acompte a
    // été versé — et la reconnaissance de cet acompte.
    expect(
      effectivePaymentStatus(echeance("2020-01-01", "partial"), enJuin),
    ).toBe("partial");
  });

  it("ne bascule pas le dernier jour du mois", () => {
    const finDeMois = new Date("2026-06-30T23:00:00Z");
    expect(
      effectivePaymentStatus(echeance("2026-06-01", "pending"), finDeMois),
    ).toBe("pending");
  });
});

describe("prochaine échéance à régler", () => {
  it("désigne la plus ancienne non soldée, pas la plus récente", () => {
    const payments = [
      echeance("2026-03-01", "pending"),
      echeance("2026-01-01", "pending"),
      echeance("2026-02-01", "paid"),
    ];
    expect(nextDuePayment(payments)?.month).toBe("2026-01-01");
  });

  it("renvoie null quand tout est soldé", () => {
    expect(nextDuePayment([echeance("2026-01-01", "paid")])).toBeNull();
  });

  it("ne modifie pas le tableau reçu", () => {
    // La liste sert aussi à l'affichage, trié du plus récent au plus
    // ancien : la trier en place inverserait l'écran du locataire.
    const payments = [
      echeance("2026-03-01", "pending"),
      echeance("2026-01-01", "pending"),
    ];
    nextDuePayment(payments);
    expect(payments[0].month).toBe("2026-03-01");
  });
});

describe("solde dû", () => {
  it("ne compte que le reliquat d'un paiement partiel", () => {
    expect(
      totalOutstanding([echeance("2026-01-01", "partial", 1000, 400)]),
    ).toBe(600);
  });

  it("ignore les échéances soldées", () => {
    expect(
      totalOutstanding([
        echeance("2026-01-01", "paid", 1000, 1000),
        echeance("2026-02-01", "pending", 1000, 0),
      ]),
    ).toBe(1000);
  });

  it("vaut zéro sans échéance", () => {
    expect(totalOutstanding([])).toBe(0);
  });

  it("additionne des montants livrés en texte par PostgREST", () => {
    // `numeric` arrive parfois sous forme de chaîne : sans conversion, la
    // somme deviendrait une concaténation.
    const rows = [
      { month: "2026-01-01", status: "pending" as PaymentStatus, amount: "900" as unknown as number, amount_paid: "100" as unknown as number },
    ];
    expect(totalOutstanding(rows)).toBe(800);
  });
});

describe("bail à afficher", () => {
  it("préfère le bail actif au plus récent", () => {
    const leases = [
      { status: "ended" as const, id: "récent" },
      { status: "active" as const, id: "actif" },
    ];
    expect(activeLease(leases)?.id).toBe("actif");
  });

  it("retombe sur le plus récent quand aucun n'est actif", () => {
    const leases = [
      { status: "ended" as const, id: "récent" },
      { status: "terminated" as const, id: "ancien" },
    ];
    expect(activeLease(leases)?.id).toBe("récent");
  });

  it("renvoie null sans bail", () => {
    expect(activeLease([])).toBeNull();
  });
});
