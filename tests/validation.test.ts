import { describe, expect, it } from "vitest";

import {
  buildingSchema,
  leaseSchema,
  paymentSchema,
  tenantSchema,
  formDataToObject,
} from "@/lib/validation";

/**
 * Les schémas Zod sont le premier filtre de toute Server Action.
 *
 * Ils sont testés ici parce qu'ils décident de ce qui entre en base, et
 * qu'une règle qui se relâche en silence — un montant vide traité comme
 * zéro, une date de fin antérieure au début — ne se voit qu'en
 * comptabilité, des mois plus tard.
 */

/** Reproduit ce qu'un formulaire HTML envoie : toutes les valeurs en texte. */
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return formDataToObject(data);
}

describe("montants", () => {
  it("accepte la virgule décimale, usuelle en français", () => {
    const parsed = paymentSchema.safeParse(
      form({
        lease_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        month: "2026-01-01",
        amount: "1234,56",
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amount).toBe(1234.56);
  });

  it("refuse un montant vide au lieu de le lire comme zéro", () => {
    // C'est le point délicat : `Number("")` vaut 0. Un loyer laissé vide
    // deviendrait un loyer gratuit, sans que personne ne le remarque.
    const parsed = paymentSchema.safeParse(
      form({
        lease_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        month: "2026-01-01",
        amount: "",
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("refuse un montant négatif", () => {
    const parsed = buildingSchema.safeParse(
      form({
        name: "Résidence",
        address: "1 rue",
        city: "Lyon",
        estimated_value: "-1",
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("laisse une valeur estimée vide à null, pas à zéro", () => {
    const parsed = buildingSchema.safeParse(
      form({ name: "R", address: "1 rue", city: "Lyon", estimated_value: "" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.estimated_value).toBeNull();
  });
});

describe("bail", () => {
  const base = {
    tenant_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    apartment_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3302",
    rent: "900",
    charges: "50",
    deposit: "900",
    start_date: "2026-01-01",
  };

  it("refuse une date de fin antérieure au début", () => {
    const parsed = leaseSchema.safeParse(
      form({ ...base, end_date: "2025-12-31" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepte une durée indéterminée", () => {
    const parsed = leaseSchema.safeParse(form({ ...base, end_date: "" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.end_date).toBeNull();
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    const parsed = leaseSchema.safeParse(form({ ...base, tenant_id: "42" }));
    expect(parsed.success).toBe(false);
  });
});

describe("locataire", () => {
  it("accepte l'absence d'e-mail", () => {
    // Un locataire sans adresse reste gérable : c'est le cas courant. Il
    // n'aura simplement pas d'accès au portail.
    const parsed = tenantSchema.safeParse(
      form({ firstname: "Awa", lastname: "Diallo", email: "" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBeNull();
  });

  it("refuse une adresse mal formée", () => {
    const parsed = tenantSchema.safeParse(
      form({ firstname: "Awa", lastname: "Diallo", email: "awa@" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("exige un nom non vide malgré les espaces", () => {
    const parsed = tenantSchema.safeParse(
      form({ firstname: "   ", lastname: "Diallo" }),
    );
    expect(parsed.success).toBe(false);
  });
});
