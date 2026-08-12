import "server-only";

/**
 * Contrat d'un fournisseur de paiement.
 *
 * ─── Pourquoi cette couche ──────────────────────────────────────────────
 * Le métier de CaisseOps — un abonnement s'active quand un paiement est
 * confirmé, et pas avant — ne doit rien savoir de la maison qui encaisse.
 * Le projet a déjà changé de fournisseur une fois ; l'écrire en dur une
 * seconde fois reviendrait à réapprendre la leçon à ses frais.
 *
 * L'interface est délibérément étroite : deux gestes suffisent au
 * parcours d'abonnement — ouvrir un paiement, et vérifier qu'il a bien eu
 * lieu. Tout le reste (passerelle, opérateur, méthode) relève du
 * fournisseur, jamais de nous. C'est précisément ce que Moneroo abstrait
 * déjà : CaisseOps ne connaît ni Orange Money ni Wave, et n'a pas à les
 * connaître.
 *
 *   SubscriptionService → PaymentProvider → MonerooPaymentProvider → API
 */

/** Ce que le métier demande pour ouvrir un paiement. */
export type CreatePaymentInput = {
  /** Montant entier dans l'unité de la devise. Vient de `plans`, jamais du client. */
  amount: number;
  /** Code ISO, « XOF ». Vient de `plans`. */
  currency: string;
  description: string;
  customer: {
    email: string;
    firstName: string;
    lastName: string;
  };
  /** Où le navigateur revient. Ne prouve rien : la confirmation est serveur. */
  returnUrl: string;
  /**
   * Données qui reviendront avec la transaction.
   *
   * Notre référence interne y voyage : c'est le seul lien qui survit si
   * l'identifiant du fournisseur n'a pas pu être enregistré chez nous.
   */
  metadata: Record<string, string>;
};

export type CreatePaymentResult = {
  /** Identifiant de la transaction CHEZ LE FOURNISSEUR. */
  transactionId: string;
  /** Page à ouvrir dans le navigateur du client. */
  checkoutUrl: string;
};

/** Ce que le métier a besoin de savoir d'une transaction, et rien de plus. */
export type VerifiedPayment = {
  /** Vrai seulement si le fournisseur confirme l'encaissement. */
  paid: boolean;
  /** Statut brut, conservé pour le journal et le diagnostic. */
  status: string;
  amount: number;
  currency: string;
  /** Métadonnées transmises à la création, telles que rendues. */
  metadata: Record<string, unknown>;
  /** « sandbox » ou « live » selon le fournisseur, quand il le dit. */
  environment?: string;
};

export interface PaymentProvider {
  /** Nom écrit dans `payments.provider`. */
  readonly name: string;

  /** Vrai si la configuration permet d'appeler le fournisseur. */
  isConfigured(): boolean;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /**
   * Interroge le fournisseur sur une transaction.
   *
   * C'est CET appel qui fait foi — jamais la notification reçue, ni le
   * retour du navigateur. Une notification dit « regarde » ; elle ne dit
   * pas « c'est payé ».
   */
  verifyPayment(transactionId: string): Promise<VerifiedPayment>;

  /**
   * Authentifie une notification entrante.
   *
   * Reçoit le corps BRUT — pas l'objet analysé : une signature porte sur
   * des octets, et re-sérialiser du JSON en change l'ordre et les espaces.
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;

  /** Extrait l'identifiant de transaction d'une notification. */
  extractTransactionId(payload: unknown): string | null;

  /** Extrait le type d'événement, pour le journal. */
  extractEventType(payload: unknown): string;
}

/** Levée quand le fournisseur refuse ou répond de travers. */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
