import { describe, expect, it } from "vitest";

import type { ActiveSubscription } from "@/lib/types";

/**
 * Tests des types et contrats d'abonnement.
 *
 * Les fonctions qui interrogent Supabase (getActiveSubscription,
 * checkDocumentQuota, checkUserLimit) ne sont pas testées ici : elles
 * dépendent de la base. On teste en revanche les contrats types et les
 * règles métier qui en découlent.
 */

const STARTER: ActiveSubscription = {
  subscription_id: "s1",
  plan_id: "p1",
  plan_slug: "starter",
  plan_name: "Starter",
  price: 3000,
  currency: "XOF",
  document_limit: 100,
  user_limit: 1,
  is_unlimited_documents: false,
  is_unlimited_users: false,
  is_launch_offer: false,
  status: "active",
  expires_at: "2026-04-01T00:00:00Z",
};

const BUSINESS: ActiveSubscription = {
  ...STARTER,
  subscription_id: "s2",
  plan_id: "p2",
  plan_slug: "business",
  plan_name: "Business",
  price: 6000,
  document_limit: 1000,
  user_limit: 5,
};

const UNLIMITED: ActiveSubscription = {
  ...STARTER,
  subscription_id: "s3",
  plan_id: "p3",
  plan_slug: "unlimited",
  plan_name: "Illimité",
  price: 10000,
  document_limit: null,
  user_limit: null,
  is_unlimited_documents: true,
  is_unlimited_users: true,
  is_launch_offer: true,
};

describe("plans — contrats métier", () => {
  it("Starter : 3000 FCFA, 100 pièces, 1 utilisateur", () => {
    expect(STARTER.price).toBe(3000);
    expect(STARTER.currency).toBe("XOF");
    expect(STARTER.document_limit).toBe(100);
    expect(STARTER.user_limit).toBe(1);
    expect(STARTER.is_unlimited_documents).toBe(false);
    expect(STARTER.is_unlimited_users).toBe(false);
  });

  it("Business : 6000 FCFA, 1000 pièces, 5 utilisateurs", () => {
    expect(BUSINESS.price).toBe(6000);
    expect(BUSINESS.document_limit).toBe(1000);
    expect(BUSINESS.user_limit).toBe(5);
    expect(BUSINESS.is_unlimited_documents).toBe(false);
    expect(BUSINESS.is_unlimited_users).toBe(false);
  });

  it("Illimité : 10000 FCFA, limites null, flags illimités", () => {
    expect(UNLIMITED.price).toBe(10000);
    expect(UNLIMITED.document_limit).toBeNull();
    expect(UNLIMITED.user_limit).toBeNull();
    expect(UNLIMITED.is_unlimited_documents).toBe(true);
    expect(UNLIMITED.is_unlimited_users).toBe(true);
    expect(UNLIMITED.is_launch_offer).toBe(true);
  });
});

/**
 * Règle de quota : la limite est atteinte quand used >= limit.
 * Cette logique vit dans checkDocumentQuota, mais on peut tester le
 * contrat isolément.
 */
describe("quota — règle de seuil", () => {
  function isQuotaReached(used: number, limit: number | null, unlimited: boolean) {
    if (unlimited) return false;
    if (limit == null) return false;
    return used >= limit;
  }

  it("Starter à 99/100 : autorisé", () => {
    expect(isQuotaReached(99, STARTER.document_limit, STARTER.is_unlimited_documents)).toBe(false);
  });

  it("Starter à 100/100 : bloqué", () => {
    expect(isQuotaReached(100, STARTER.document_limit, STARTER.is_unlimited_documents)).toBe(true);
  });

  it("Business à 999/1000 : autorisé", () => {
    expect(isQuotaReached(999, BUSINESS.document_limit, BUSINESS.is_unlimited_documents)).toBe(false);
  });

  it("Business à 1000/1000 : bloqué", () => {
    expect(isQuotaReached(1000, BUSINESS.document_limit, BUSINESS.is_unlimited_documents)).toBe(true);
  });

  it("Illimité à 99999 : jamais bloqué", () => {
    expect(isQuotaReached(99999, UNLIMITED.document_limit, UNLIMITED.is_unlimited_documents)).toBe(false);
  });
});

/**
 * Règle de renouvellement : si l'abonnement expire le 20 septembre et
 * qu'on renouvelle le 15, la nouvelle expiration est le 20 octobre —
 * pas le 15 octobre. Les jours restants ne sont pas perdus.
 */
describe("renouvellement — calcul d'expiration", () => {
  function computeRenewal(
    currentExpiry: Date,
    now: Date,
    durationDays: number,
  ): Date {
    if (currentExpiry > now) {
      // Renouvellement avant expiration : on ajoute la durée.
      const next = new Date(currentExpiry);
      next.setUTCDate(next.getUTCDate() + durationDays);
      return next;
    }
    // Abonnement expiré : on repart de maintenant.
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + durationDays);
    return next;
  }

  it("renouvellement avant expiration : ajoute la durée à l'expiration actuelle", () => {
    const now = new Date("2026-09-15T10:00:00Z");
    const current = new Date("2026-09-20T00:00:00Z");
    const next = computeRenewal(current, now, 30);
    expect(next.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("renouvellement après expiration : repart de maintenant", () => {
    const now = new Date("2026-09-25T10:00:00Z");
    const current = new Date("2026-09-20T00:00:00Z");
    const next = computeRenewal(current, now, 30);
    expect(next.toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });

  it("renouvellement le jour même avant l'heure d'expiration : ajoute la durée", () => {
    // L'expiration est à minuit, on renouvelle à 10h la veille : l'expiration
    // n'est pas encore passée, on ajoute donc la durée à l'expiration actuelle.
    const now = new Date("2026-09-19T10:00:00Z");
    const current = new Date("2026-09-20T00:00:00Z");
    const next = computeRenewal(current, now, 30);
    expect(next.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});

/**
 * Vérification du montant : le montant payé doit correspondre
 * exactement au prix du plan. Un écart d'un franc bloque l'activation.
 */
describe("vérification — concordance du montant", () => {
  function amountsMatch(paid: number, expected: number): boolean {
    return Number(paid) === Number(expected);
  }

  it("3000 payés pour Starter à 3000 : accepté", () => {
    expect(amountsMatch(3000, STARTER.price)).toBe(true);
  });

  it("1000 payés pour Starter à 3000 : refusé", () => {
    expect(amountsMatch(1000, STARTER.price)).toBe(false);
  });

  it("6000 payés pour Business à 6000 : accepté", () => {
    expect(amountsMatch(6000, BUSINESS.price)).toBe(true);
  });

  it("10000 payés pour Illimité à 10000 : accepté", () => {
    expect(amountsMatch(10000, UNLIMITED.price)).toBe(true);
  });

  it("9999 payés pour Illimité à 10000 : refusé", () => {
    expect(amountsMatch(9999, UNLIMITED.price)).toBe(false);
  });
});
