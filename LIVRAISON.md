# Mise en production de CaisseOps

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
| `SUPABASE_SERVICE_ROLE_KEY` | oui | Crée les comptes que l'organisation n'ouvre pas elle-même : invitation d'un collaborateur. **Contourne le RLS** : jamais de préfixe `NEXT_PUBLIC_`. |
| `SMTP_PROVIDER_CONFIGURED` | non | `true` une fois un vrai SMTP raccordé. Purement déclaratif : éteint l'avertissement de `/setup`, n'active rien. |
| `SENTRY_DSN` | non | Prépare le signalement d'erreurs. Absent, l'application fonctionne normalement. |

Sans `SUPABASE_SERVICE_ROLE_KEY`, l'invitation d'un collaborateur reste
impossible : personne ne peut être ajouté à l'organisation.

Le build **n'exige aucune de ces variables** : il aboutit sans elles, et
l'application dégrade vers l'écran de diagnostic `/setup`. C'est vérifié par
la CI, qui compile volontairement sans configuration.

---

## 2. Services externes

### Supabase — base, authentification

1. `SQL Editor` → coller [`supabase/schema.sql`](supabase/schema.sql) →
   exécuter. Le script est **rejouable** et ne détruit aucune donnée : il
   est à relancer après chaque mise à jour touchant la base.
2. `Authentication → URL Configuration` :
   - *Site URL* : `https://<votre-domaine>`
   - *Redirect URLs* : `https://<votre-domaine>/auth/callback`

   Utile pour la réinitialisation de mot de passe en libre-service, seul
   parcours qui repasse par un lien envoyé par Supabase. Les liens
   d'activation, eux, sont fabriqués par l'application sur son propre
   domaine et ne dépendent pas de ce réglage.

### SMTP — non bloquant

`Authentication → SMTP Settings` : raccorder un fournisseur (Resend,
Postmark, SendGrid…), puis poser `SMTP_PROVIDER_CONFIGURED=true`.

**La mise en service ne l'exige plus.** Le SMTP intégré de Supabase répond
`429 — email rate limit exceeded` après une poignée d'envois : sur le
projet de développement, une fois le quota atteint, plus aucun compte ne
pouvait être créé ni aucun collaborateur invité. Les deux parcours qui en
dépendaient ont donc été refaits sans envoi :

| Parcours | Ce qui se passe |
| --- | --- |
| Inscription | Le compte est créé et la session ouverte dans la foulée. |
| Invitation d'un collaborateur | L'écran Équipe rend un **lien d'activation** que le gestionnaire transmet par WhatsApp, SMS ou de vive voix. |

Ce n'est pas qu'un contournement : sur le marché visé, WhatsApp atteint un
collaborateur plus sûrement qu'une adresse e-mail qu'il consulte rarement.

Reste tributaire d'un envoi : **la réinitialisation de mot de passe en
libre-service** (`/forgot-password`). Sans SMTP, un utilisateur qui a perdu
son mot de passe doit passer par son gestionnaire, qui lui régénère un lien
depuis l'écran Équipe. C'est acceptable pour un lancement, pas à
l'échelle — d'où le raccordement recommandé.

Pour réactiver la confirmation d'e-mail à l'inscription une fois le SMTP en
place : poser `AUTH_REQUIRE_EMAIL_CONFIRMATION=true`. Aucun code à
réécrire, voir [`lib/auth-config.ts`](lib/auth-config.ts).

### Suivi d'erreurs — une variable suffit

Poser `SENTRY_DSN` et c'est tout : rien à installer, rien à décommenter.
[`lib/observability.ts`](lib/observability.ts) journalise toujours sur la
sortie serveur que Vercel conserve, et transmet en plus à Sentry dès que la
variable est présente.

L'envoi passe par l'API d'ingestion en HTTP, sans le SDK
([`lib/sentry-envelope.ts`](lib/sentry-envelope.ts)) : aucune dépendance à
installer ou à maintenir, aucun poids ajouté aux déploiements qui n'ont pas
de DSN, et rien qui puisse faire échouer un build. L'envoi n'est jamais
attendu et son échec est ignoré — une supervision qui ralentit ou casse la
production qu'elle observe serait un mauvais marché.

Seuls des identifiants circulent : jamais un nom, une adresse ou le contenu
d'une pièce. Vérifié par un test.

### Accessibilité — vérifiée par un outil

```
npx playwright test e2e/accessibility.spec.ts
```

axe-core inspecte les écrans — publics et back-office peuplé —, en
mobile et en desktop, contre les critères WCAG 2.1 niveau AA.

À savoir : axe couvre environ un tiers des critères. Zéro violation
signifie « aucun défaut mécaniquement détectable », pas « accessible ». Le
jugement humain reste à porter sur la pertinence des textes alternatifs,
l'ordre de tabulation et l'usage réel au lecteur d'écran.

---

## 3. Migrations SQL

Un seul fichier, rejouable : [`supabase/schema.sql`](supabase/schema.sql).

[`supabase/reset.sql`](supabase/reset.sql) est **destructif** et n'a de sens
que pour repartir d'une base vide.

### À rejouer sans attendre — correctif de sécurité

Le déclencheur `profiles_guard_columns` ferme une **escalade de
privilèges**. Le RLS raisonne par lignes et jamais par colonnes : la policy
`profiles_update`, qui autorise chacun à corriger son propre nom,
autorisait du même geste `role`. N'importe quel compte pouvait exécuter
contre l'API publique :

```sql
UPDATE profiles SET role = 'owner' WHERE id = auth.uid();
```

et devenir propriétaire de l'organisation qui l'héberge. Aucun écran ne
proposait ce geste, mais PostgREST est joignable directement : le
formulaire n'est pas la frontière.

Vérifiable en une commande, avant et après :

```
npm run verify:rls
```

Les assertions de la section « ESCALADE DE PRIVILÈGES » échouent sur un
schéma non corrigé. La même exécution vérifie qu'un propriétaire promeut
toujours ses collaborateurs — corriger la faille sans casser la gestion
d'équipe.

### Autres raisons de relancer le script

- la garde du trigger d'audit, sans laquelle **une organisation ne peut pas
  être supprimée** (clôture de compte, effacement à la demande) ;
- les fonctions qualifiées `public.` dans les policies ;

---

## 4. Vérifications après déploiement

Dans cet ordre. Les trois premières se lancent en ligne de commande.

```
npm run test          # validation, montant en lettres, pagination, CSV, supervision
npm run verify:rls    # cloisonnement et escalade de privilèges
npm run test:e2e      # parcours complet + WCAG AA, mobile et desktop
```

`verify:rls` et `test:e2e` **écrivent en base** et nettoient derrière eux :
à lancer sur un projet de développement, jamais en production.

Puis, sur le déploiement lui-même :

- [ ] `/setup` — tout au vert et « Version du schéma : à jour ». « Envoi des
      e-mails » reste en avertissement tant que `SMTP_PROVIDER_CONFIGURED`
      n'est pas posé : c'est attendu, rien n'est bloqué.
- [ ] Créer un compte sur `/signup` : l'onboarding s'ouvre immédiatement,
      sans passer par une boîte mail.
- [ ] Renseigner l'en-tête imprimé (raison sociale, activités, coordonnées).
- [ ] Émettre un reçu : vérifier le numéro `REC-AAAA-0001`, le montant en
      toutes lettres, et l'aperçu d'impression qui reproduit l'en-tête.
- [ ] Émettre un bon de caisse (entrée, puis sortie) et un bon de sortie :
      vérifier la numérotation continue et les gabarits d'impression.
- [ ] Inviter un collaborateur depuis **Équipe** : un lien d'activation
      s'affiche. Vérifier qu'il porte **votre** domaine, pas celui de
      Supabase, et qu'il ouvre l'écran « Bienvenue » dans une autre fenêtre.
- [ ] Le collaborateur se connecte : il voit les pièces de l'organisation,
      pas celles d'une autre.
- [ ] Exporter les reçus en CSV : le fichier s'ouvre directement dans Excel
      francophone, colonnes et accents intacts.
- [ ] Consulter `/audit` en tant que propriétaire : chaque création de pièce
      est journalisée avec l'acteur, l'avant, l'après et l'adresse IP.
- [ ] Tenter de supprimer une pièce en tant que caissier : refusé. En tant
      que gestionnaire : accepté, et le trou reste visible en audit.

---

## 5. Ce qui n'est pas couvert

État des lieux honnête plutôt que checklist entièrement cochée.

- **Pas de facturation de l'abonnement** : la page de tarifs affiche un
  prix, mais rien ne le perçoit. L'inscription est libre et gratuite.
- **Pas de portail tiers** : CaisseOps est l'outil de l'entreprise, pas un
  portail pour des clients ou des chauffeurs. Les pièces s'impriment et se
  remettent en main propre.
- **Pièces imprimées depuis le navigateur** plutôt que générées en PDF côté
  serveur : suffisant à l'usage, mais la mise en page dépend du navigateur
  de l'opérateur.
- **Documents légaux à l'état de projet** : le fond est rédigé, l'identité
  de l'éditeur reste à compléter et l'ensemble doit être relu par un
  conseil. Les pages le disent et refusent l'indexation tant que des points
  subsistent.
- **Pas d'envoi d'e-mail** : ni inscription, ni invitation, ni notification.
  Seule la réinitialisation de mot de passe en libre-service en dépend,
  et exige un SMTP raccordé.
