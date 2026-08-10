import { describe, expect, it } from "vitest";

import { generateTransactionId } from "@/lib/cinetpay";

/**
 * Tests unitaires des utilitaires CinetPay.
 *
 * Les fonctions réseau (createCinetpayPayment, verifyCinetpayPayment)
 * ne sont pas testées ici : elles dépendent de variables d'environnement
 * et d'un service externe. Elles sont couvertes par les tests
 * d'intégration et le scénario manuel de la Sandbox.
 */
describe("generateTransactionId", () => {
  it("produit un identifiant unique à chaque appel", () => {
    const a = generateTransactionId();
    const b = generateTransactionId();
    expect(a).not.toBe(b);
  });

  it("préfixe avec COP", () => {
    const id = generateTransactionId();
    expect(id.startsWith("COP-")).toBe(true);
  });

  it("ne contient que des caractères alphanumériques et des tirets", () => {
    const id = generateTransactionId();
    expect(id).toMatch(/^COP-[A-Z0-9]+-[A-Z0-9]+$/);
  });
});
