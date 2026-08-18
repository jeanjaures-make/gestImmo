# Abonnements CaisseOps

## Inscription — subordonnée au paiement

Aucun compte CaisseOps n'existe avant que Moneroo n'ait confirmé
l'encaissement. Pas de session, pas d'organisation, pas de profil — et
surtout aucun mot de passe stocké en attendant : le compte naît sans mot
de passe (`generateLink(type:'invite')`, le même mécanisme que
l'invitation d'un collaborateur), et son titulaire en choisit un
seulement après, sur `/reset-password?bienvenue=1`.

```
/offres  →  /signup (email + nom d'entreprise, PAS de mot de passe)
   ↓
signup_intents (pending)  +  payments (pending, organization_id NULL)
   ↓
Moneroo
   ↓
webhook signé  →  confirm_signup_payment()  →  provision_signup_intent()
                   (verrou SQL)                 (organisation, profil
                                                  owner, abonnement actif)
   ↓
/payment/success sonde /api/signup/status, puis /api/signup/claim
   ↓
session ouverte (verrou « claimed_at », usage unique)
   ↓
/reset-password?bienvenue=1  →  mot de passe choisi  →  /dashboard
```

**Table `signup_intents`** — le pendant, avant paiement, de ce que
`organizations`/`profiles` deviennent après. `status` : `pending` →
`paid` (paiement confirmé, provisionnement en cours) → `active`
(organisation, profil et abonnement existent) — ou `failed` / `cancelled`
/ `expired`. Aucune policy RLS : seul le service_role la touche, exactement
comme `payment_events`.

**`payments.organization_id` est nullable** — un paiement d'inscription
précède l'organisation qu'il finira par financer. `payments.intent_id`
porte le lien. Un paiement de renouvellement (propriétaire déjà connecté
sur `/subscribe`) garde `organization_id` dès sa création et `intent_id`
à `NULL` : c'est ce qui distingue les deux chemins dans le webhook.

**Fonctions SQL** (`supabase/subscriptions.sql`), toutes `REVOKE`d pour
`anon`/`authenticated` — seul le service_role les appelle :

- `confirm_signup_payment(transaction_id, method)` — verrouille la ligne
  de paiement (`FOR UPDATE`), la fait passer à `paid`, ainsi que
  l'intention. Idempotent : une notification rejouée obtient
  `already_paid` ou `already_active`, jamais une seconde confirmation.
- `provision_signup_intent(intent_id, user_id)` — crée l'organisation, le
  profil propriétaire et l'abonnement actif, dans une seule transaction.
  Appelée par le webhook juste après `generateLink`, qui seul crée le
  compte Supabase Auth. Idempotente à son tour : verrouille l'intention,
  ne recrée rien si elle est déjà `active`.
- `fail_signup_intent(transaction_id, status)` — échec ou annulation ;
  ne régresse jamais une intention déjà `active`.
- `claim_signup_intent(intent_id)` — pose `claimed_at` de façon atomique
  (`UPDATE ... WHERE claimed_at IS NULL`) : une intention ne s'ouvre
  qu'une fois, même si le lien de retour est visité deux fois.
- `signup_intent_status(intent_id)` — lue par `/api/signup/status` ; ne
  rend qu'un mot, jamais l'e-mail ni le nom de l'entreprise.

**Le webhook** (`app/api/webhooks/moneroo/route.ts`) distingue les deux
natures de paiement par `payments.intent_id` : `NULL` suit le chemin
`confirm_payment` existant (renouvellement, inchangé) ; renseigné suit le
nouveau chemin ci-dessus. Dans les deux cas, mêmes gardes en amont :
signature HMAC, re-vérification serveur auprès de Moneroo, montant et
devise comparés à `plans.price` — jamais au corps de la notification.

**Preuves** : `npm run verify:rls`, section « INSCRIPTION SUBORDONNÉE AU
PAIEMENT » (paiement pending/failed/cancelled → aucun compte, double
webhook simultané → un seul compte, montant forgé → refusé avant même
d'être écrit) ; `e2e/signup-gate.spec.ts` (le lien de retour ouvre une
session une seule fois, un retour manuel sur `/payment/success` n'ouvre
jamais rien, le choix du mot de passe après activation mène au tableau
de bord).

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
