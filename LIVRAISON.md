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
| `SUPABASE_SERVICE_ROLE_KEY` | oui | Crée les comptes que l'organisation n'ouvre pas elle-même : celui du souscripteur, une fois son paiement confirmé, et celui d'un collaborateur invité. **Contourne le RLS** : jamais de préfixe `NEXT_PUBLIC_`. |
| `CHARIOW_API_KEY` | oui | Clé **secrète** du tableau de bord Chariow (`sk_live_...` ou `sk_test_...`) — jamais la publique. Sans elle, aucun encaissement, donc aucune inscription. Jamais de préfixe `NEXT_PUBLIC_`. |
| `CHARIOW_WEBHOOK_SECRET` | oui | Secret Pulse (`whsec_...`) pour authentifier les notifications de paiement (HMAC-SHA256 du corps reçu). Absente, le webhook **refuse tout** : un oubli ferme la porte au lieu de l'ouvrir. |
| `CRON_SECRET` | oui | Authentifie le balayage quotidien des abonnements échus (`vercel.json`). Absente, la route refuse de s'exécuter : rien n'expire jamais, et les intentions d'inscription abandonnées s'accumulent. |
| `CHARIOW_API_URL` | non | Ne sert qu'à viser un autre hôte (défaut : `https://api.chariow.com/v1`). |
| `NEXT_PUBLIC_SITE_URL` | non | URL canonique, si le domaine servi n'est pas celui que Vercel annonce. Sinon déduite de `VERCEL_PROJECT_PRODUCTION_URL`. |
| `SMTP_PROVIDER_CONFIGURED` | non | `true` une fois un vrai SMTP raccordé. Purement déclaratif : éteint l'avertissement de `/setup`, n'active rien. |
| `SENTRY_DSN` | non | Prépare le signalement d'erreurs. Absent, l'application fonctionne normalement. |

Les quatre premières ne sont pas négociables depuis que l'inscription est
subordonnée au paiement : sans les clés Chariow, rien n'est encaissé ni
confirmé ; sans `SUPABASE_SERVICE_ROLE_KEY`, le paiement confirmé
n'aboutit à aucun compte. **Aucun client ne peut alors entrer**, et
l'invitation d'un collaborateur tombe avec.

[`.env.example`](.env.example) porte le détail de chacune, avec l'endroit
exact où la récupérer.

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

**La mise en service ne l'exige pas.** Le SMTP intégré de Supabase répond
`429 — email rate limit exceeded` après une poignée d'envois. Trois
parcours créent un compte sans qu'aucun message ne parte :

| Parcours | Ce qui se passe |
| --- | --- |
| Inscription | Le paiement confirmé déclenche `generateLink(type:'invite')` — le compte naît sans mot de passe, et son titulaire en choisit un lui-même sur `/reset-password?bienvenue=1`. Voir `docs/subscriptions.md`. |
| Invitation d'un collaborateur | L'écran Équipe rend un **lien d'activation** que le gestionnaire transmet par WhatsApp, SMS ou de vive voix. |

Ce n'est pas qu'un contournement : sur le marché visé, WhatsApp atteint un
collaborateur plus sûrement qu'une adresse e-mail qu'il consulte rarement.

Reste tributaire d'un envoi : **la réinitialisation de mot de passe en
libre-service** (`/forgot-password`). Sans SMTP, un utilisateur qui a perdu
son mot de passe doit passer par son gestionnaire, qui lui régénère un lien
depuis l'écran Équipe. C'est acceptable pour un lancement, pas à
l'échelle — d'où le raccordement recommandé.

Le parcours antérieur — inscription libre, organisation créée dans la
foulée — ne laisse plus de code derrière lui : `lib/auth-config.ts`,
`signUp`/`signUpInstant`/`signUpWithConfirmation` et le formulaire
d'onboarding ont été retirés. `/onboarding` subsiste, mais n'est plus une
mise en route : c'est une impasse explicative pour un compte dont le
profil a disparu.

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

Trois fichiers, rejouables, dans cet ordre :
[`supabase/schema.sql`](supabase/schema.sql), puis
[`supabase/subscriptions.sql`](supabase/subscriptions.sql) (plans,
abonnements, paiements, inscription subordonnée au paiement), puis
[`supabase/property.sql`](supabase/property.sql) (biens, locataires,
quittances de loyer).

L'ordre n'est pas indicatif : `subscriptions.sql` et `property.sql`
s'interrompent d'emblée, avec un message qui nomme la base et le rôle
atteints, si le script dont ils dépendent n'a pas été joué sur celle-ci.
L'éditeur SQL de Supabase joue un collage en **une seule transaction** —
un échec annule tout, y compris ce qui semblait avoir abouti avant, ce
qui rend trompeur tout diagnostic tiré de l'endroit où l'erreur
s'affiche.

[`supabase/reset.sql`](supabase/reset.sql) est **destructif** et n'a de sens
que pour repartir d'une base vide.

### À rejouer sans attendre — inscription subordonnée au paiement

`supabase/subscriptions.sql` porte désormais la table `signup_intents` et
les fonctions `confirm_signup_payment`, `provision_signup_intent`,
`fail_signup_intent`, `claim_signup_intent`, `signup_intent_status`. Sans
elles, `/signup` reste accessible mais **aucun compte ne peut plus
naître** : la route qui l'amorce échoue proprement (message à l'écran),
mais rien n'aboutit tant que le script n'est pas rejoué. Voir
`docs/subscriptions.md`.

Vérifiable en une commande :

```
npm run check:db
```

La section « INSCRIPTION SUBORDONNÉE AU PAIEMENT » doit être entièrement
verte. `npm run verify:rls` en apporte la preuve fonctionnelle — paiement
pending/failed/cancelled sans compte, double webhook sans doublon, montant
forgé refusé avant même d'être écrit.

### Gestion immobilière

`supabase/property.sql` porte `properties`, `tenants`, `rent_receipts`
et leur compteur de numérotation. Sans lui, les écrans Biens, Locataires
et Quittances répondent une erreur de table absente ; le reste du produit
est intact.

`npm run check:db` le vérifie — section « GESTION IMMOBILIÈRE
(property.sql) » — et `npm run verify:rls` en apporte la preuve
fonctionnelle : cloisonnement entre organisations, numérotation sous
verrou, quittance émise incorrigible, annulation conservée. Voir
[`docs/immobilier.md`](docs/immobilier.md).

### À rejouer sans attendre — la dernière porte gratuite

`supabase/schema.sql` révoque désormais `create_organization` pour `anon`
et `authenticated`. Sans ce REVOKE, la fonction hérite du droit
d'exécution accordé par défaut à PUBLIC : elle est `SECURITY DEFINER` et
n'exige qu'un compte authentifié **sans profil**. PostgREST étant
joignable directement, un tel compte pouvait se fabriquer une
organisation en une requête, sans rien payer — ce que tout le reste de ce
changement s'emploie à empêcher.

Un tel compte n'a rien de théorique : un collaborateur retiré de son
équipe garde son compte d'authentification si la clé de service manque au
moment du retrait, et les inscriptions de l'ancien parcours libre ont pu
s'interrompre avant l'onboarding.

Depuis ce correctif, une organisation naît par **un seul chemin** :
`provision_signup_intent`, appelée par le webhook après encaissement
confirmé.

`npm run check:db` le vérifie en interrogeant la fonction avec la clé
anonyme : un refus de PostgREST prouve la révocation, tandis qu'un refus
de la fonction elle-même (« Authentification requise ») trahit un droit
encore ouvert.

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
- [ ] Choisir une offre sur `/offres`, s'inscrire sur `/signup` (adresse et
      nom d'entreprise), régler chez Moneroo avec un moyen de test. Vérifier
      qu'aucun tableau de bord n'est accessible avant la confirmation, puis
      que le lien de retour ouvre bien l'écran « Bienvenue », sans boîte
      mail.
- [ ] Renseigner l'en-tête imprimé (raison sociale, activités, coordonnées)
      depuis les Réglages.
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

- **La première facture seulement.** L'inscription exige désormais un
  paiement confirmé par Moneroo — aucun compte ne se crée avant, voir
  `docs/subscriptions.md`. Il manque encore un écran d'historique des
  règlements et une facture téléchargeable pour un client qui en
  redemande une plus tard.
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
