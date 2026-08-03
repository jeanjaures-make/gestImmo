# ImmoOps

Plateforme privée de pilotage immobilier, multi-tenant par organisation.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Supabase (PostgreSQL, Auth, Storage) · Zod · Recharts.

## Mise en route

1. **Créer le projet Supabase** sur [supabase.com/dashboard](https://supabase.com/dashboard).

2. **Créer le schéma** : `SQL Editor` → coller
   [`supabase/schema.sql`](supabase/schema.sql) → exécuter.
   Si vous aviez appliqué un schéma antérieur (modèle `owner_id`), lancez
   d'abord [`supabase/reset.sql`](supabase/reset.sql) — il est **destructif**
   et n'a de sens que sans données à conserver.

3. **Renseigner `.env.local`** (`Project Settings → API`) :

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
   SUPABASE_SERVICE_ROLE_KEY=<clé service_role>
   ```

   L'URL est une URL, pas une clé. Ne jamais mettre la clé `service_role`
   dans une variable `NEXT_PUBLIC_*` : elle contourne le RLS.

   La clé `service_role` sert aux deux seules opérations qu'une session
   utilisateur ne peut pas faire : créer un compte pour quelqu'un d'autre
   (inviter un collaborateur, ouvrir l'espace d'un locataire). **Sans elle,
   le portail locataire est inaccessible** — personne ne peut y être invité.

4. `npm run dev`, puis **`/setup`** — la page exécute un diagnostic réel
   (variables, format des clés, joignabilité du projet, présence et version
   du schéma) et vous dit ce qui manque. L'application n'affiche jamais une
   500 pour un défaut de configuration.

5. Créer un compte sur `/signup`, puis nommer son organisation.

6. Créer un immeuble, un logement, un locataire, puis un bail. Depuis
   l'écran **Locataires**, « Ouvrir l'accès » produit un lien d'activation
   à transmettre au locataire — aucun e-mail n'est envoyé.

## Les deux applications

Le produit sert deux publics qui ne se ressemblent pas, et n'essaie pas de
leur donner la même interface.

**Le portail locataire** (`/portal`) et le tableau de bord propriétaire sont
pensés pour le téléphone : navigation par barre basse, cartes plutôt que
tableaux, cibles tactiles d'au moins 44 px, aucune modale sur les parcours
courants — le formulaire de déclaration de paiement se déplie dans la carte
de l'échéance plutôt que de recouvrir le montant qu'on vient régler. Les
chiffres décisifs tiennent au-dessus de la ligne de flottaison.

**Le back-office** (immeubles, baux, dépenses, audit, équipe) reste optimisé
pour desktop et tablette : les tableaux denses et le journal d'audit s'y
consultent mieux. Il reste utilisable sur téléphone, où la barre latérale
cède la place à une barre basse sur les cinq écrans les plus fréquents.

## Ce que voit chaque profil

| | Propriétaire / gestionnaire | Locataire |
|---|---|---|
| Accueil | Revenus, encaissé, impayés, occupation, alertes, activité | Prochain loyer, solde, logement, interventions |
| Loyers | Toutes les échéances, encaissement, règlements déclarés | Ses échéances, quittances, déclaration de règlement |
| Interventions | Tout le parc, affectation, changement de statut | Les siennes, déclaration d'incident |
| Documents | Tout le dossier de l'organisation | Ceux rattachés à sa fiche et à ses baux |
| Notifications | Incidents déclarés, règlements à valider | Bail, quittances, suivi de ses incidents |

## Vérifier le cloisonnement

```
npm run verify:rls
```

Le script crée deux organisations jetables et un compte locataire, vérifie
qu'aucun périmètre ne déborde sur l'autre, puis supprime tout ce qu'il a
créé. Il écrit en base : à lancer sur un projet de développement, jamais en
production.

Il existe parce qu'une policy RLS relue n'est pas une policy RLS testée. Un
défaut de cloisonnement ne se voit pas à l'usage — il se voit le jour où un
client lit les données d'un autre.

## Devise

Le produit compte en **francs CFA**. La devise est déclarée une seule fois,
dans [lib/money.ts](lib/money.ts) — l'éparpiller finirait par la faire
diverger d'un écran à l'autre.

Deux francs CFA coexistent, de même valeur mais distincts : `XOF` pour la
zone UEMOA (affiché « F CFA »), `XAF` pour la zone CEMAC (affiché
« FCFA »). `XOF` est retenu par défaut ; basculer tient en une ligne.

L'affichage omet les décimales — le franc CFA n'a pas de sous-unité en
usage — mais la base en conserve deux, sans perte.

## Modèle multi-tenant

Toutes les tables métier portent `organization_id`. Deux mécanismes
indépendants garantissent l'étanchéité :

- **RLS** sur les 12 tables : lecture réservée aux membres de
  l'organisation, écriture filtrée par rôle.
- **Clés étrangères composites** `(parent_id, organization_id)` →
  `(id, organization_id)`. Rattacher le locataire d'une organisation au
  logement d'une autre n'est pas « interdit par le code » : c'est rejeté par
  PostgreSQL.

### Rôles

| Rôle | Droits |
|---|---|
| `owner` | Accès total, administration de l'organisation |
| `manager` | Gestion quotidienne du parc, baux, interventions |
| `accountant` | Lecture complète + saisie des paiements |
| `viewer` | Lecture seule |

## Règles appliquées en base, pas dans l'UI

- Un seul bail actif par logement (index unique partiel).
- Numéro de logement unique par immeuble.
- Clôturer un bail remet le logement en « Libre » (trigger).
- Une échéance de loyer est normalisée au 1er du mois (trigger) et unique
  par couple (bail, mois).
- Une seule déclaration de paiement en attente par échéance (index unique
  partiel) : un double envoi ne peut pas produire deux encaissements.
- Toute création / modification / suppression métier est journalisée dans
  `audit_logs` par trigger `SECURITY DEFINER` — l'application ne peut pas
  contourner l'audit.
- Les notifications naissent de triggers, jamais du code applicatif : aucun
  chemin d'écriture ne peut oublier de prévenir l'intéressé, et personne ne
  peut s'en fabriquer (la table n'a aucune policy d'insertion).

## Paiement du loyer

Aucun prestataire de paiement n'est raccordé. Le locataire règle selon les
modalités convenues, puis **déclare** son règlement depuis son espace
(montant, date, moyen, référence).

Une déclaration n'est pas un encaissement : `rent_payments` reste intact
jusqu'à ce qu'un gestionnaire la valide. Un locataire ne peut donc pas
solder sa dette en remplissant un formulaire. La validation passe par
`review_payment_declaration()`, qui marque la déclaration et encaisse
l'échéance dans une seule transaction — deux requêtes séparées laisseraient,
au moindre incident, un encaissement sans trace ou l'inverse.

Le jour où un prestataire sera raccordé, il s'insérera au même endroit : une
déclaration créée et validée par le webhook plutôt que par un humain.

## Réglages et exports

`/settings` réunit ce qui relève du compte plutôt que du parc : nom affiché,
changement de mot de passe **sans quitter l'application**, connexions
récentes, fermeture de toutes les sessions, et — pour un propriétaire — le
nom et le logo de l'organisation.

Le changement de mot de passe redemande l'ancien, ce que Supabase n'exige
pas. Sans cette ressaisie, une session laissée ouverte sur un poste partagé
suffit à changer le mot de passe et à verrouiller le titulaire hors de son
propre compte. C'est aussi la seule voie qui ne dépende d'aucun envoi
d'e-mail.

Les listes Paiements, Dépenses, Locataires et Baux s'exportent en CSV. Trois
détails décident si le fichier s'ouvre correctement ou en bouillie, et
aucun n'est deviné par l'utilisateur qui double-clique : séparateur
point-virgule, décimales à la virgule, et BOM UTF-8 — sans quoi Excel
francophone empile tout dans la première colonne et massacre les accents.
Les cellules commençant par `=`, `+`, `-` ou `@` sont neutralisées : un nom
de locataire est une donnée saisie par un tiers, et un tableur exécute ce
genre de cellule. Voir [`lib/csv.ts`](lib/csv.ts) et ses tests.

L'export pagine jusqu'à épuisement plutôt que de faire une requête unique :
PostgREST plafonne les réponses, et un export comptable tronqué en silence
est le pire des défauts — rien ne distingue « il n'y a que mille paiements »
de « on vous en a caché quatre mille ». Le nombre de lignes voyage dans
l'en-tête `X-Row-Count`.

## Ouvrir un accès sans envoyer d'e-mail

Ouvrir l'espace d'un locataire, ou inviter un collaborateur, ne déclenche
aucun envoi. L'écran affiche un **lien d'activation** que le gestionnaire
transmet lui-même : WhatsApp, SMS, ou de vive voix.

Ce n'est pas un pis-aller. Sur le marché visé, WhatsApp atteint un locataire
bien plus sûrement qu'une adresse e-mail qu'il consulte rarement — quand il
en a une. Le gestionnaire connaît son locataire et sait par où le joindre ;
l'application n'a pas à en décider à sa place. Accessoirement, cela affranchit
la mise en service du SMTP de Supabase, dont le quota s'épuise en quelques
envois.

Le lien porte le domaine de l'application, pas celui de Supabase. Ce détail
est structurel : `generateLink` renvoie bien une URL toute prête, mais elle
rebondit vers nous en plaçant la session dans le *fragment* (`#access_token=…`),
que le serveur ne reçoit jamais — le locataire retomberait sur l'écran de
connexion sans explication. On fabrique donc le lien à partir du jeton haché
([`lib/activation-link.ts`](lib/activation-link.ts)), vérifié côté serveur par
[`app/auth/callback`](app/auth/callback/route.ts), qui pose les cookies comme
pour une connexion ordinaire.

Ce lien **ouvre une session** : il vaut identifiant et mot de passe réunis.
Il n'est donc ni journalisé ni écrit en base — affiché une fois, puis oublié.
S'il se perd, on en régénère un, ce qui invalide le précédent.

Reste tributaire d'un envoi : la réinitialisation de mot de passe en
libre-service. Sans SMTP, l'utilisateur passe par son gestionnaire, qui lui
régénère un lien.

## Sécurité

- **Le jeton est revalidé auprès du serveur Auth** par `getUser()` dans
  [lib/auth.ts](lib/auth.ts), avant que la moindre page ne lise des données.
  Le proxy, lui, se contente de `getSession()` : il ne décide que d'une
  redirection, pas d'un accès. L'y faire revalider doublait le coût de
  chaque affichage — un aller-retour réseau par requête, préchargements de
  liens compris — jusqu'à saturer le quota Auth (`429`) et pénaliser les
  vrais utilisateurs. Un cookie forgé franchit donc le proxy pour se
  heurter aussitôt à `getUser()` puis au RLS : il n'obtient rien.
- Protection CSRF native des Server Actions (vérification Origin/Host).
- Validation Zod **côté serveur systématiquement**, partagée avec le client
  ([lib/validation.ts](lib/validation.ts)).
- Bucket `documents` privé, cloisonné par organisation ; téléchargements par
  URL signée valable 60 s ([app/documents/download/route.ts](app/documents/download/route.ts)).
- Limitation de débit **partagée par toutes les instances** : le compteur
  vit dans PostgreSQL, incrémenté par un `INSERT … ON CONFLICT DO UPDATE`
  atomique ([lib/rate-limit.ts](lib/rate-limit.ts)). Un compteur en mémoire
  aurait valu, sur Vercel, N fois la limite demandée. Si la base est
  injoignable, un repli en mémoire prend le relais : un incident de base ne
  doit pas ouvrir la porte.
- **Cloisonnement du locataire** : son profil porte `tenant_id`, ce qui rend
  `is_staff()` faux. Toutes les policies du back-office l'exigeant, les deux
  périmètres sont disjoints par construction — un locataire ne voit ni les
  autres locataires, ni les dépenses, ni le journal d'audit. Son rôle
  (`viewer`) n'y est pour rien : ce n'est pas lui qui le protège.
- **Colonnes sensibles figées par déclencheur.** Le RLS raisonne par lignes,
  jamais par colonnes : la policy qui laisse chacun corriger son propre nom
  laissait du même geste modifier son `role` et son `tenant_id`. Un
  locataire pouvait donc se promouvoir propriétaire en une requête contre
  l'API publique — le formulaire n'est pas la frontière. Le déclencheur
  `profiles_guard_columns` refuse désormais ces écritures, sauf pour un
  propriétaire modifiant le rôle de quelqu'un d'autre. Éprouvé dans les deux
  sens par `npm run verify:rls` : la faille doit être détectée, et le geste
  légitime doit continuer de passer.
- Journal des connexions, réussies comme échouées (`login_events`),
  consultable par son titulaire sur `/settings`, avec fermeture de toutes
  les sessions en un geste.
- Messages d'authentification volontairement indistincts pour ne pas
  révéler quels comptes existent.

## Graphiques

La palette de séries (`--chart-1..5`) est **validée par script**, pas choisie
à l'œil : bande de luminance, plancher de chroma, séparation deutan / protan
/ tritan sur les paires adjacentes, contraste ≥ 3:1. Les couleurs de statut
(`--success`, `--warning`, `--destructive`) sont réservées et ne servent
jamais de couleur de série. Le mode sombre a ses propres valeurs validées
contre la surface sombre — ce n'est pas une inversion automatique.

## Déploiement sur Vercel

1. Importer le dépôt, laisser Vercel détecter Next.js.
2. Déclarer les trois variables d'environnement (§ Mise en route) sur les
   environnements *Production* et *Preview*. `SUPABASE_SERVICE_ROLE_KEY` ne
   porte pas de préfixe `NEXT_PUBLIC_` : elle reste côté serveur.
3. Dans Supabase, `Authentication → URL Configuration` : ajouter l'URL de
   production en *Site URL*, et `https://<domaine>/auth/callback` aux
   *Redirect URLs*. Ce réglage ne concerne que la réinitialisation de mot de
   passe en libre-service : les liens d'activation sont fabriqués par
   l'application sur son propre domaine et s'en passent.
4. Vérifier `/setup` en production : le diagnostic confirme la version du
   schéma déployé.

## Limites connues

- **Pas de paiement en ligne** : le locataire déclare son règlement, un
  gestionnaire le valide (§ Paiement du loyer). Le raccordement d'un
  prestataire est prévu par la structure, pas encore fait.
- **Notifications dans l'application seulement** : ni e-mail ni push. La
  table `notifications` est le point de départ naturel d'un envoi
  asynchrone, mais rien ne sort aujourd'hui de l'interface.
- **Pas de relance automatique des impayés** : les retards sont calculés et
  affichés, jamais notifiés d'eux-mêmes. Il y faudrait une tâche planifiée
  (`pg_cron` ou Vercel Cron), absente à ce stade.
- **Un locataire, un bail à la fois** dans le portail : le bail actif, ou à
  défaut le plus récent. Un colocataire disposant de son propre compte voit
  bien ses échéances, mais l'écran n'est pas pensé pour les baux multiples
  simultanés.
- **Quittances imprimées depuis le navigateur** plutôt que générées en PDF
  côté serveur : suffisant à l'usage, mais la mise en page dépend du
  navigateur du locataire.
