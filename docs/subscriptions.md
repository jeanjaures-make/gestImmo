# Abonnements CaisseOps

## Architecture

L'abonnement appartient à l'**organisation**, pas à l'utilisateur. Une organisation peut avoir plusieurs utilisateurs, mais un seul abonnement actif à la fois.

```
organizations 1───∞ subscriptions ∞───1 plans
                       │
                       └───∞ payments ∞───1 plans
```

## Cycle de vie

```
pending  →  active  →  expired
   │          │
   │          └─── cancelled
   │
   └── (paiement échoué : reste pending, puis nettoyé)
```

1. **pending** : l'utilisateur a cliqué « Commencer », un paiement est en cours chez le fournisseur.
2. **active** : le webhook a confirmé le paiement, `started_at` et `expires_at` sont renseignés.
3. **expired** : `expires_at < now()`. L'utilisateur peut encore se connecter, mais la création de pièces est bloquée.
4. **cancelled** : annulation manuelle (futur).

## Renouvellement

La règle : **les jours restants ne sont jamais perdus**.

- Si l'abonnement expire le 20 septembre et que le client renouvelle le 15 septembre → nouvelle expiration = 20 octobre.
- Si l'abonnement est déjà expiré → nouvelle expiration = maintenant + 30 jours.

Cette logique est implémentée dans le webhook (`app/api/webhooks/moneroo/route.ts` et la fonction SQL `confirm_payment`).

## Quotas

### Pièces (reçus, bons de caisse, bons de sortie)

Le quota est calculé sur la **période de l'abonnement actif** (du `started_at` au `expires_at`), via la fonction SQL `count_documents_this_period()`.

- Starter : 100 pièces / période
- Business : 1 000 pièces / période
- Illimité : illimité

La vérification se fait côté serveur dans chaque Server Action de création (`receipts/actions.ts`, `cash-vouchers/actions.ts`, `delivery-notes/actions.ts`).

### Utilisateurs

- Starter : 1 utilisateur
- Business : 5 utilisateurs
- Illimité : illimité

La vérification se fait dans `team/actions.ts` avant chaque invitation.

## Fonctions utilitaires

### `getActiveSubscription(organizationId)`

Retourne l'abonnement actif avec le plan joint, ou `null` si aucun.

### `checkDocumentQuota(organizationId)`

Retourne `{ allowed: true }` ou `{ allowed: false, used, limit, planName }`.

### `checkUserLimit(organizationId)`

Retourne `{ allowed: true }` ou `{ allowed: false, current, limit, planName }`.

## Expiration

Quand `expires_at < now()` :
- L'utilisateur peut se connecter et consulter ses données.
- La création de pièces est bloquée.
- L'invitation de membres est bloquée.
- Un message invite à renouveler.

## Journal d'audit

Le journal d'audit complet est inclus dans Business et Illimité. Starter conserve les mécanismes d'audit existants — aucune suppression de fonctionnalité.
