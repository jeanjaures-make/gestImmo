import "server-only";

import { ChariowPaymentProvider } from "./chariow";
import type { PaymentProvider } from "./provider";

export type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  VerifiedPayment,
} from "./provider";
export { PaymentProviderError } from "./provider";

/**
 * Le fournisseur en service.
 *
 * Un seul endroit à changer le jour où l'on en ajoute un second, et un
 * seul import pour tout le reste du code. Les routes n'instancient jamais
 * `ChariowPaymentProvider` directement : elles demandent « le
 * fournisseur », ce qui les garde ignorantes de son nom.
 */
const provider: PaymentProvider = new ChariowPaymentProvider();

export function paymentProvider(): PaymentProvider {
  return provider;
}

/**
 * Référence interne de la transaction.
 *
 * Chariow attribue son propre identifiant, mais seulement APRÈS l'appel :
 * il nous en faut donc un avant, pour poser la ligne `payments` en
 * attente. Celui-ci voyage ensuite dans les métadonnées et reste le fil
 * qui relie les deux si l'identifiant Chariow n'a pas pu être enregistré.
 */
export function generatePaymentReference(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `COP-${timestamp}-${random}`.toUpperCase();
}
