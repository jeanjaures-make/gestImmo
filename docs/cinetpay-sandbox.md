# Intégration CinetPay Sandbox

## Configuration

### 1. Variables d'environnement

Ajoutez les variables suivantes dans `.env.local` (jamais dans `.env.example` avec des valeurs réelles) :

```env
CINETPAY_ENV=test
CINETPAY_API_KEY=your_sandbox_api_key
CINETPAY_SITE_ID=your_sandbox_site_id
CINETPAY_API_URL=https://api-checkout.cinetpay.com/v2
CINETPAY_CHECKOUT_URL=https://checkout.cinetpay.com
```

**Important** :
- Aucune de ces variables n'est préfixée `NEXT_PUBLIC_` : elles restent côté serveur.
- `CINETPAY_API_KEY` ne doit jamais apparaître dans le navigateur, les logs ou le code source.

### 2. Compte CinetPay Sandbox

1. Créez un compte sur [https://cinetpay.com](https://cinetpay.com).
2. Dans le tableau de bord, créez un site en mode **Test/Sandbox**.
3. Récupérez le `SITE_ID` et l'`API_KEY` depuis les paramètres du site.
4. Renseignez l'URL de notification (webhook) : `https://votre-domaine.com/api/webhooks/cinetpay`

### 3. Cartes de test Sandbox

| Champ | Valeur |
|-------|--------|
| Numéro | 4242 4242 4242 4242 |
| Expiration | N'importe quelle date future |
| CVV | 123 |

## Flux de paiement

```
Utilisateur
    ↓
/subscribe (choix du plan)
    ↓
POST /api/payments/cinetpay/create
    ↓
  - Authentification Supabase
  - Récupération du plan depuis la DB
  - Génération transaction_id unique
  - Création payment (pending) + subscription (pending)
  - Appel CinetPay Sandbox
    ↓
Redirection vers CinetPay Checkout
    ↓
Paiement de test (carte 4242…)
    ↓
CinetPay envoie le webhook → POST /api/webhooks/cinetpay
    ↓
  - Enregistrement du payload dans payment_events
  - Vérification serveur auprès de CinetPay (/payment/check)
  - Vérification du statut (accepted)
  - Vérification du montant (correspondance exacte)
  - Vérification de la devise
  - Idempotence (si déjà paid, on ne rejoue pas)
    ↓
payment.status = paid
subscription.status = active
expires_at = now() + 30 jours (ou ajouté à l'expiration existante)
    ↓
Utilisateur redirigé vers /payment/success
    ↓
Abonnement actif, quotas appliqués
```

## Routes API

### `POST /api/payments/cinetpay/create`

Crée un paiement CinetPay Sandbox.

**Body** :
```json
{ "plan_id": "uuid-du-plan" }
```

**Réponse** (200) :
```json
{
  "payment_url": "https://checkout.cinetpay.com/...",
  "transaction_id": "COP-XXXX-XXXX"
}
```

**Erreurs** :
- 401 : non authentifié
- 400 : `plan_id` manquant
- 404 : plan introuvable ou inactif
- 503 : CinetPay non configuré
- 502 : erreur côté CinetPay

### `POST /api/webhooks/cinetpay`

Reçoit les notifications de CinetPay. **Route publique** — la sécurité repose sur la vérification serveur auprès de CinetPay.

**Traitement** :
1. Extraction du `transaction_id`.
2. Enregistrement du payload dans `payment_events`.
3. Recherche du paiement local.
4. Idempotence : si déjà `paid`, retour 200 sans action.
5. Vérification auprès de CinetPay (`/payment/check`).
6. Vérification du montant, de la devise.
7. Activation : `payment → paid`, `subscription → active`.

## Sécurité

- **Clés CinetPay** : uniquement côté serveur, jamais en `NEXT_PUBLIC_*`.
- **RLS Supabase** : `payments` et `subscriptions` ne sont lisibles que par l'organisation propriétaire.
- **Vérification serveur** : le webhook ne fait jamais confiance au payload seul — il re-vérifie auprès de CinetPay.
- **Concordance du montant** : le montant payé doit correspondre exactement au prix du plan en base. Un écart d'un franc bloque l'activation.
- **Idempotence** : un même événement reçu deux fois ne réactive pas l'abonnement.
- **Transaction ID unique** : contrainte `UNIQUE` sur `payments.transaction_id`.

## Migration Sandbox → Production

Quand le compte CinetPay sera validé en production :

1. **Récupérer les clés de production** : dans le tableau de bord CinetPay, basculez le site en mode **Production** et récupérez le nouveau `SITE_ID` et `API_KEY`.

2. **Mettre à jour les variables d'environnement** sur Vercel :
   ```env
   CINETPAY_ENV=production
   CINETPAY_API_KEY=your_production_api_key
   CINETPAY_SITE_ID=your_production_site_id
   CINETPAY_API_URL=https://api-checkout.cinetpay.com/v2
   CINETPAY_CHECKOUT_URL=https://checkout.cinetpay.com
   ```

3. **Vérifier l'URL du webhook** dans le tableau de bord CinetPay : elle doit pointer vers `https://votre-domaine.com/api/webhooks/cinetpay`.

4. **Aucun changement de code** : le code est identique en Sandbox et en Production. Seules les variables d'environnement changent.

5. **Tester un paiement réel** avec une petite somme avant d'ouvrir à tous les utilisateurs.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `lib/cinetpay.ts` | Client CinetPay (création + vérification) |
| `lib/subscriptions.ts` | Fonctions d'abonnement et de quota |
| `app/api/payments/cinetpay/create/route.ts` | Route de création de paiement |
| `app/api/webhooks/cinetpay/route.ts` | Webhook de notification |
| `app/subscribe/page.tsx` | Page de sélection des plans |
| `components/plan-card.tsx` | Carte de plan tarifaire |
| `app/payment/success/page.tsx` | Page de retour succès |
| `app/payment/cancel/page.tsx` | Page de retour annulation |
| `supabase/subscriptions.sql` | Schéma SQL (plans, subscriptions, payments, events) |
