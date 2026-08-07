# CaisseOps

Émission et impression de pièces de caisse — reçus, bons de caisse et bons de
sortie — à votre en-tête, dans un espace sécurisé réservé à votre entreprise.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Supabase (PostgreSQL, Auth) · Zod · Recharts.

## Mise en route

1. **Créer le projet Supabase** sur [supabase.com/dashboard](https://supabase.com/dashboard).

2. **Créer le schéma** : `SQL Editor` → coller
   [`supabase/schema.sql`](supabase/schema.sql) → exécuter. Le script est
   rejouable et ne détruit aucune donnée. Si vous aviez appliqué un schéma
   antérieur (modèle immobilier), lancez d'abord
   [`supabase/reset.sql`](supabase/reset.sql) — il est **destructif** et n'a de
   sens que sans données à conserver.

3. **Renseigner `.env.local`** (`Project Settings → API`) :

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
   SUPABASE_SERVICE_ROLE_KEY=<clé service_role>
   ```

   L'URL est une URL, pas une clé. Ne jamais mettre la clé `service_role`
   dans une variable `NEXT_PUBLIC_*` : elle contourne le RLS.

   La clé `service_role` sert à la seule opération qu'une session utilisateur
   ne peut pas faire : créer un compte pour un collaborateur invité
   (écran Équipe). **Sans elle, l'invitation d'un collaborateur est
   inaccessible** — personne ne peut être ajouté à l'organisation.

4. `npm run dev`, puis **`/setup`** — la page exécute un diagnostic réel
   (variables, format des clés, joignabilité du projet, présence et version
   du schéma) et vous dit ce qui manque. L'application n'affiche jamais une
   500 pour un défaut de configuration.

5. Créer un compte sur `/signup`, puis nommer son organisation et renseigner
   son en-tête imprimé (raison sociale, activités, coordonnées).

6. Émettre un reçu, un bon de caisse ou un bon de sortie depuis le tableau de
   bord. L'impression reproduit votre en-tête.

## Les trois pièces

Le produit émet trois pièces de caisse, chacune avec son numéro continu, son
formulaire dédié et son gabarit d'impression :

- **Reçu** (`REC-AAAA-NNNN`) — « Reçu de M./Mme », cadre bon pour francs,
  montant en toutes lettres, articles, avance et reste. Établi au nom de
  l'émetteur.
- **Bon de caisse** (`BC-AAAA-NNNN`) — entrée ou sortie, bénéficiaire, motif,
  avance et reste. Règlement cash ou dépôt avec référence de bordereau,
  imputation sur compte personnel ou compte entreprise.
- **Bon de sortie** (`BS-AAAA-NNNN`) — tableau d'articles (désignation,
  quantité, destination, observations), émetteur, service et visa du chef de
  service. Exemplaire chauffeur par défaut.

L'interface est pensée pour le comptoir et le téléphone : navigation par
barre basse, cartes plutôt que tableaux, cibles tactiles d'au moins 44 px,
aucune modale sur les parcours courants. Le back-office (audit, équipe,
exports) reste lisible sur desktop et tablette.

## Vérifier le cloisonnement

```
npm run verify:rls
```

Le script crée deux organisations jetables, vérifie qu'aucun périmètre ne
déborde sur l'autre, puis supprime tout ce qu'il a créé. Il écrit en base : à
lancer sur un projet de développement, jamais en production.

Il existe parce qu'une policy RLS relue n'est pas une policy RLS testée. Un
défaut de cloisonnement ne se voit pas à l'usage — il se voit le jour où une
entreprise lit les données d'une autre.

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

- **RLS** sur les tables : lecture réservée aux membres de
  l'organisation, écriture filtrée par rôle.
- **Clés étrangères composites** `(parent_id, organization_id)` →
  `(id, organization_id)`. Rattacher une ligne d'une organisation à une
  ligne d'une autre n'est pas « interdit par le code » : c'est rejeté par
  PostgreSQL.

### Rôles

| Rôle | Droits |
|---|---|
| `owner` | Accès total, administration de l'organisation |
| `manager` | Gestion quotidienne, pièces, audit, équipe |
| `accountant` | Émission et correction des pièces, pas de suppression |
| `viewer` | Lecture seule |

## Règles appliquées en base, pas dans l'UI

- Numérotation continue, par nature de pièce et par année
  (`REC-2026-0001`, `BC-2026-0001`, `BS-2026-0001`), attribuée par la base et
  gelée après émission.
- La suppression d'une pièce est réservée aux propriétaires et
  gestionnaires ; le trou est assumé et reste visible en cas de contrôle.
- Toute création / modification / suppression métier est journalisée dans
  `audit_logs` par trigger `SECURITY DEFINER` — l'application ne peut pas
  contourner l'audit.

## En-tête imprimé

L'en-tête (raison sociale, forme juridique, activités, téléphone, adresse,
logo) appartient à l'organisation et se renseigne une fois, à l'onboarding.
Chaque entreprise imprime ses pièces sous son propre en-tête ; les gabarits
reproduisent le papier à en-tête — cadre BPF du reçu, tableau encadré du bon
de sortie — et l'aperçu est identique à l'imprimé.

## Exports

Les reçus, bons de caisse et bons de sortie s'exportent en CSV. Trois détails
décident si le fichier s'ouvre correctement ou en bouillie, et aucun n'est
deviné par l'utilisateur qui double-clique : séparateur point-virgule,
décimales à la virgule, et BOM UTF-8 — sans quoi Excel francophone empile
tout dans la première colonne et massacre les accents. Les cellules
commençant par `=`, `+`, `-` ou `@` sont neutralisées : un nom de
bénéficiaire est une donnée saisie par un tiers, et un tableur exécute ce
genre de cellule. Voir [`lib/csv.ts`](lib/csv.ts) et ses tests.

L'export pagine jusqu'à épuisement plutôt que de faire une requête unique :
PostgREST plafonne les réponses, et un export comptable tronqué en silence
est le pire des défauts — rien ne distingue « il n'y a que mille reçus » de
« on vous en a caché q…

Le compte exact est annoncé via l'en-tête `X-Row-Count`.

## Inviter un collaborateur sans envoyer d'e-mail

Inviter un collaborateur ne déclenche aucun envoi. L'écran affiche un **lien
d'activation** que le gestionnaire transmet lui-même : WhatsApp, SMS, ou de
vive voix.

Ce n'est pas un pis-aller. Sur le marché visé, WhatsApp atteint un
collaborateur bien plus sûrement qu'une adresse e-mail qu'il consulte
rarement. Le gestionnaire connaît son équipe et sait par qui la joindre ;
l'application n'a pas à en décider à sa place. Accessoirement, cela
affranchit la mise en service du SMTP de Supabase, dont le quota s'épuise en
quelques envois.

Le lien porte le domaine de l'application, pas celui de Supabase. Ce détail
est structurel : `generateLink` renvoie bien une URL toute prête, mais elle
rebondit vers nous en plaçant la session dans le *fragment*
(`#access_token=…`), que le serveur ne reçoit jamais — le collaborateur
retomberait sur l'écran de connexion sans explication. On fabrique donc le
lien à partir du jeton haché ([`lib/activation-link.ts`](lib/activation-link.ts)),
vérifié côté serveur par [`app/auth/callback`](app/auth/callback/route.ts), qui
pose les cookies comme pour une connexion ordinaire.

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
- Limitation de débit **partagée par toutes les instances** : le compteur
  vit dans PostgreSQL, incrémenté par un `INSERT … ON CONFLICT DO UPDATE`
  atomique ([lib/rate-limit.ts](lib/rate-limit.ts)). Un compteur en mémoire
  aurait valu, sur Vercel, N fois la limite demandée. Si la base est
  injoignable, un repli en mémoire prend le relais : un incident de base ne
  doit pas ouvrir la porte.
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
   *Redirect URLs*. Ce réglage ne concerne que la réinitialisation de mot
   de passe en libre-service : les liens d'activation sont fabriqués par
   l'application sur son propre domaine et s'en passent.
4. Vérifier `/setup` en production : le diagnostic confirme la version du
   schéma déployé.

## Limites connues

- **Aucune facturation de l'abonnement** : la page de tarifs affiche un
  prix, mais rien ne le perçoit. L'inscription est libre et gratuite. Une
  facturation manuelle convient à un lancement restreint ; au-delà, il
  faudra un mécanisme.
- **Documents légaux à l'état de projet** : le fond est rédigé et décrit
  fidèlement le traitement des données, mais l'identité de l'éditeur reste
  à compléter et l'ensemble doit être relu par un conseil. Les pages le
  disent et refusent l'indexation tant que des points subsistent.
- **Pas de portail tiers** : CaisseOps est l'outil de votre entreprise, pas
  un portail pour des clients ou des chauffeurs. Les pièces s'impriment et
  se remettent en main propre. Il n'y a pas de paiement en ligne ni
  d'espace client.
- **Pièces imprimées depuis le navigateur** plutôt que générées en PDF côté
  serveur : suffisant à l'usage, mais la mise en page dépend du navigateur
  de l'opérateur.
