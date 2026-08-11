# Plans CaisseOps

## Plans officiels

Les plans sont stockés en base de données dans la table `plans`. **Aucun prix n'est codé en dur dans le frontend.**

### Starter

| Champ | Valeur |
|-------|--------|
| `slug` | `starter` |
| `price` | 3 000 FCFA |
| `currency` | XOF |
| `billing_interval` | month |
| `duration_days` | 30 |
| `document_limit` | 100 |
| `user_limit` | 1 |
| `is_unlimited_documents` | false |
| `is_unlimited_users` | false |
| `is_launch_offer` | false |
| `has_audit_log` | false |

Fonctionnalités :
- Jusqu'à 100 pièces par mois (reçus, bons de caisse, bons de sortie)
- Impression à l'en-tête de l'entreprise
- 1 utilisateur

### Business

| Champ | Valeur |
|-------|--------|
| `slug` | `business` |
| `price` | 6 000 FCFA |
| `currency` | XOF |
| `billing_interval` | month |
| `duration_days` | 30 |
| `document_limit` | 1 000 |
| `user_limit` | 5 |
| `is_unlimited_documents` | false |
| `is_unlimited_users` | false |
| `is_launch_offer` | false |
| `has_audit_log` | true |

Fonctionnalités :
- Jusqu'à 1 000 pièces par mois
- Rôles et permissions
- Journal d'audit complet
- 5 utilisateurs

### Illimité

| Champ | Valeur |
|-------|--------|
| `slug` | `unlimited` |
| `price` | 10 000 FCFA |
| `currency` | XOF |
| `billing_interval` | month |
| `duration_days` | 30 |
| `document_limit` | NULL |
| `user_limit` | NULL |
| `is_unlimited_documents` | true |
| `is_unlimited_users` | true |
| `is_launch_offer` | true |
| `has_audit_log` | true |

Fonctionnalités :
- Pièces illimitées
- Utilisateurs illimités
- Journal d'audit complet
- Accompagnement à la reprise de données

**Offre de lancement** : le flag `is_launch_offer = true` permet au marketing de modifier le positionnement sans toucher au code de paiement.

## Capacité du journal d'audit

La colonne `has_audit_log` détermine si le journal d'audit complet est accessible. Starter ne l'inclut pas (`false`) ; Business et Illimité l'incluent (`true`). Cette capacité est vérifiée côté serveur dans la page `/audit` et masquée de la navigation latérale lorsque l'offre ne la fournit pas. L'écriture du journal (triggers PostgreSQL) reste active quel que soit le plan — seule la consultation est restreinte.

## Règle absolue

Le frontend envoie uniquement `{ plan_id }` à la route de création. Le backend récupère le prix, la devise et la durée depuis la table `plans`. **Ne jamais envoyer le montant depuis le navigateur.**

## Modification des plans

Pour modifier un prix ou une limite, exécutez un `UPDATE` sur la table `plans` dans l'éditeur SQL Supabase. Le changement est immédiat — aucune redéploiement nécessaire.

```sql
-- Exemple : passer Starter à 4 000 FCFA
UPDATE plans SET price = 4000, updated_at = NOW() WHERE slug = 'starter';
```

## Schéma SQL

Voir `supabase/subscriptions.sql` pour la définition complète des tables `plans`, `subscriptions`, `payments` et `payment_events`.
