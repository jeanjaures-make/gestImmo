# Mise en production d'ImmoOps

Ce document sert à mettre le produit en service, puis à vérifier qu'il
l'est réellement. Il liste aussi ce qui n'est **pas** couvert — un état des
lieux honnête vaut mieux qu'une checklist entièrement cochée.

---

## 1. Variables d'environnement

Déclarées sur Vercel dans `Project Settings → Environment Variables`, pour
**Production** et **Preview**.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | oui | URL du projet. C'est une URL, pas une clé. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | oui | Clé publique. Soumise au RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | Crée les comptes que l'organisation n'ouvre pas elle-même : invitation d'un collaborateur, ouverture de l'espace d'un locataire. **Contourne le RLS** : jamais de préfixe `NEXT_PUBLIC_`. |
| `SMTP_PROVIDER_CONFIGURED` | non | `true` une fois un vrai SMTP raccordé. Purement déclaratif : éteint l'avertissement de `/setup`, n'active rien. |
| `SENTRY_DSN` | non | Prépare le signalement d'erreurs. Absent, l'application fonctionne normalement. |

Sans `SUPABASE_SERVICE_ROLE_KEY`, le portail locataire reste inaccessible :
personne ne peut y être invité.

Le build **n'exige aucune de ces variables** : il aboutit sans elles, et
l'application dégrade vers l'écran de diagnostic `/setup`. C'est vérifié par
la CI, qui compile volontairement sans configuration.

---

## 2. Services externes

### Supabase — base, authentification, stockage

1. `SQL Editor` → coller [`supabase/schema.sql`](supabase/schema.sql) →
   exécuter. Le script est **rejouable** et ne détruit aucune donnée : il
   est à relancer après chaque mise à jour touchant la base.
2. `Authentication → URL Configuration` :
   - *Site URL* : `https://<votre-domaine>`
   - *Redirect URLs* : `https://<votre-domaine>/auth/callback`

   Sans cela, les liens d'invitation et de réinitialisation renvoient vers
   `localhost`.
3. Vérifier que le bucket `documents` est **privé** (le script s'en charge,
   mais un bucket public rendrait tous les baux téléchargeables).

### SMTP — bloquant pour la mise en service

`Authentication → SMTP Settings` : raccorder un fournisseur (Resend,
Postmark, SendGrid…), puis poser `SMTP_PROVIDER_CONFIGURED=true`.

**Ce point n'est pas optionnel.** Le SMTP intégré de Supabase répond
`429 — email rate limit exceeded` après une poignée d'envois. Constaté sur
le projet de développement : une fois le quota atteint, plus aucun compte
ne peut être créé et plus aucun locataire ne peut être invité. Toute la
mise en service d'un client passe par là.

### Suivi d'erreurs — recommandé

[`lib/observability.ts`](lib/observability.ts) journalise déjà les erreurs
critiques avec une référence, sur la sortie serveur que Vercel conserve.
Pour aller plus loin : `npm i @sentry/nextjs`, poser `SENTRY_DSN`, et
décommenter l'appel `captureException` du module. Tant que la variable est
absente, aucune dépendance n'est chargée et aucun appel réseau n'est fait.

---

## 3. Migrations SQL

Un seul fichier, rejouable : [`supabase/schema.sql`](supabase/schema.sql).

[`supabase/reset.sql`](supabase/reset.sql) est **destructif** et n'a de sens
que pour repartir d'une base vide.

À relancer notamment pour bénéficier de :
- la garde du trigger d'audit, sans laquelle **une organisation ne peut pas
  être supprimée** (clôture de compte, effacement à la demande) ;
- `is_staff()` sur `rent_payments_write`, qui empêche un compte locataire
  promu « comptable » d'écrire en caisse ;
- les fonctions qualifiées `public.` dans les policies Storage, sans
  lesquelles un locataire ne peut pas télécharger sa quittance.

---

## 4. Vérifications après déploiement

Dans cet ordre. Les trois premières se lancent en ligne de commande.

```
npm run test          # 40 tests : validation, pagination, règles de loyer
npm run verify:rls    # 22 assertions de cloisonnement, contre la vraie base
npm run test:e2e      # parcours complet, navigateur, mobile et desktop
```

`verify:rls` et `test:e2e` **écrivent en base** et nettoient derrière eux :
à lancer sur un projet de développement, jamais en production.

Puis, sur le déploiement lui-même :

- [ ] `/setup` — tout au vert, « Version du schéma : à jour », et « Envoi
      des e-mails » sans avertissement.
- [ ] Créer un compte sur `/signup` et recevoir l'e-mail de confirmation.
      *C'est le test qui échoue en premier si le SMTP n'est pas raccordé.*
- [ ] Créer immeuble → logement → locataire → bail, en laissant cochée la
      génération des échéances.
- [ ] Depuis **Locataires**, « Ouvrir l'accès » : l'invitation arrive.
- [ ] Le locataire se connecte : il voit son bail, pas ceux des autres.
- [ ] Il déclare un règlement ; le gestionnaire le voit en tête de
      `/payments` et l'encaisse.
- [ ] Clôturer le bail : le logement repasse en « Libre ».
- [ ] Ouvrir le produit **sur un téléphone**, pas en simulation.

---

## 5. Ce qui n'est pas couvert

À lire avant de promettre quoi que ce soit à un client.

**Chaîne e-mail non éprouvée automatiquement.** `e2e/signup.spec.ts` existe
mais reste désactivé : sans SMTP, il échouerait pour un quota et non pour
une régression. Une fois le fournisseur raccordé :

```
E2E_EMAIL_ENABLED=1 E2E_EMAIL_DOMAIN=votredomaine.fr npm run test:e2e
```

**Pas de paiement en ligne.** Le locataire déclare son règlement, un
gestionnaire le valide. Une déclaration n'est jamais un encaissement tant
qu'elle n'est pas validée.

**Notifications dans l'application seulement.** Ni e-mail ni push. Un
locataire qui n'ouvre pas le portail n'apprend rien.

**Pas de relance automatique des impayés.** Les retards sont calculés et
affichés, jamais notifiés d'eux-mêmes : il y faudrait une tâche planifiée.

**Quittances imprimées depuis le navigateur**, non générées en PDF côté
serveur. La mise en page dépend du navigateur du locataire, et les mentions
obligatoires n'ont pas été vérifiées contre le droit applicable.

**Volet juridique entièrement à faire** : mentions légales, CGU/CGV,
politique de confidentialité, registre RGPD, accord de sous-traitance avec
Supabase. Ce n'est pas du code, et cela conditionne la vente.

**Accessibilité non auditée.** Les cibles tactiles, le contraste et les
libellés ont été traités par construction ; aucun audit outillé WCAG AA n'a
été passé.

**Sauvegardes non vérifiées.** Supabase en assure selon le forfait ; aucune
restauration n'a été testée.
