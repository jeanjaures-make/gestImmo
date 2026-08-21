# Intégration Chariow — CaisseOps

Ce document décrit l'intégration de **Chariow** comme passerelle de paiement pour les abonnements et inscriptions SaaS de CaisseOps.

---

## 1. Vue d'ensemble

Chariow gère les encaissements en Afrique francophone (notamment Côte d'Ivoire) via :
- **Wave**
- **Orange Money**
- **MTN Mobile Money**
- **Moov Money**
- **Cartes bancaires (Visa / Mastercard)**

### Flux de paiement

```text
Utilisateur (Inscription ou Changement de plan)
  ↓
Next.js Action / API Route (Validation serveur du plan et du montant)
  ↓
Chariow API POST /v1/checkout (avec custom_metadata: payment_ref, intent_id, plan_id)
  ↓
Client redirigé vers Chariow Checkout
  ↓
Paiement via Wave, Orange Money, MTN, Moov...
  ↓
Webhook Chariow (Pulse) POST /api/webhooks/chariow (avec signature HMAC-SHA256)
  ↓
Vérification d'authenticité + Re-vérification via GET /v1/sales/{id}
  ↓
Exécution RPC Supabase (confirm_payment ou confirm_signup_payment + provisioning)
  ↓
Abonnement actif dans Supabase & Accès instantané aux fonctionnalités
```

---

## 2. Variables d'environnement

| Variable | Description |
|---|---|
| `CHARIOW_API_KEY` | Clé secrète API Chariow (`sk_live_...` ou `sk_test_...`). |
| `CHARIOW_WEBHOOK_SECRET` | Secret de signature du webhook Pulse Chariow (`whsec_...`). |
| `CHARIOW_API_URL` | *(Optionnel)* URL de base de l'API (défaut : `https://api.chariow.com/v1`). |
| `CHARIOW_DEFAULT_PRODUCT_ID` | *(Optionnel)* ID public ou slug du produit par défaut si non spécifié par plan. |

---

## 3. Configuration des Pulses (Webhooks) dans Chariow

1. Se connecter au tableau de bord Chariow.
2. Aller dans **Automations** → **Pulses** → **Add Pulse**.
3. Définir l'URL du webhook : `https://<votre-domaine>/api/webhooks/chariow`.
4. Sélectionner les événements :
   - `successful.sale` (paiement réussi)
   - `failed.sale` (paiement échoué)
   - `abandoned.sale` (paiement abandonné)
5. Copier le **Signing Secret** (`whsec_...`) dans la variable `CHARIOW_WEBHOOK_SECRET`.

---

## 4. Sécurité & Idempotence

1. **Signature HMAC-SHA256** : Chaque requête entrante porte l'en-tête `x-chariow-signature` comparé en temps constant (`timingSafeEqual`) au hash HMAC du corps brut.
2. **Idempotence** : `x-pulse-delivery-id` est conservé dans `payment_events` pour dédupliquer les livraisons multiples sans retraiter deux fois.
3. **Re-vérification serveur** : Le statut final est toujours revalidé via `GET /v1/sales/{saleId}` avant d'exécuter l'activation dans la base.
4. **Montants validés en base** : Le montant renvoyé par Chariow est rigoureusement comparé au prix enregistré dans la table `plans`.
