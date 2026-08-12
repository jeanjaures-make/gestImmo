# Paiement des abonnements — Moneroo

CaisseOps n'encaisse rien lui-même. Il ouvre une transaction chez Moneroo,
envoie le client sur la page de paiement hébergée par Moneroo, puis attend
une notification qu'il **re-vérifie** avant d'activer quoi que ce soit.

```
CaisseOps → Moneroo → passerelle → méthode de paiement → client
```

Le code métier ne connaît ni Orange Money, ni Wave, ni MTN. C'est
précisément ce que Moneroo abstrait, et la raison pour laquelle
[`lib/payments/provider.ts`](../lib/payments/provider.ts) ne parle que de
« créer un paiement » et « vérifier un paiement ».

---

## 1. Terminer la vérification du compte

Rien de ce qui suit ne fonctionne tant que Moneroo n'a pas validé votre
compte. C'est la première étape et elle ne dépend pas du code : connectez-vous
au tableau de bord Moneroo et complétez la vérification demandée.

## 2. Ajouter une passerelle de paiement

Tableau de bord Moneroo → **Ajouter une passerelle de paiement**.

Une passerelle est l'établissement qui encaisse réellement. CaisseOps
n'en sait rien et n'a pas à en savoir : aucun nom de passerelle n'apparaît
dans le code, et il ne doit jamais y en apparaître.

## 3. Ajouter une méthode de paiement

Tableau de bord Moneroo → **Ajouter une méthode de paiement**.

Activez ce que votre passerelle propose réellement pour votre pays —
mobile money, et carte bancaire si elle est disponible.

**CaisseOps n'envoie aucune liste de méthodes.** La requête omet
volontairement le champ `methods` : sans liste, Moneroo propose ce qui est
activé sur le compte. Énumérer les méthodes dans le code figerait une
disponibilité qui se règle au tableau de bord, et casserait le jour où
vous en ajoutez une.

## 4. Récupérer les clés

Tableau de bord Moneroo → section développeurs.

Moneroo distingue une clé **publique** et une clé **secrète**. C'est la
secrète qu'il faut, et elle ne doit jamais quitter le serveur.

```env
MONEROO_SECRET_KEY=
MONEROO_WEBHOOK_SECRET=
```

Dans `.env.local` en développement, dans les variables d'environnement
Vercel en production. **Jamais dans le code, jamais dans Git, jamais avec
un préfixe `NEXT_PUBLIC_`.**

Il n'y a pas de variable d'environnement `MONEROO_ENV`. L'URL de base est
la même en test et en production : **c'est la clé qui choisit
l'environnement**. Une variable qui ne commande rien finit par mentir sur
l'état réel du système. L'environnement effectif se lit dans la réponse de
vérification, champ `environment`.

## 5. Déclarer le webhook

Tableau de bord Moneroo → webhooks. URL à déclarer :

```
https://<votre-domaine>/api/webhooks/moneroo
```

Relevez le secret de signature et posez-le dans `MONEROO_WEBHOOK_SECRET`.

**Sans ce secret, le webhook refuse tout.** C'est délibéré : accepter
faute de pouvoir vérifier transformerait l'oubli d'une variable en
activation gratuite des abonnements pour quiconque connaît l'URL.

---

## 6. Première transaction

1. Vérifiez `/setup` puis connectez-vous avec un compte **propriétaire** —
   les autres rôles ne peuvent pas souscrire.
2. Ouvrez `/subscribe` et choisissez un plan.
3. Le navigateur part sur `checkout.moneroo.io`. Payez avec les moyens de
   test de votre passerelle.
4. Au retour, `/payment/success` affiche « Paiement reçu, vérification en
   cours ». **Cette page ne prouve rien** : elle peut être ouverte à la
   main.
5. La confirmation arrive par le webhook. Vérifiez en base :

```sql
select p.transaction_id, p.status, p.amount, s.status, s.expires_at
from payments p
left join subscriptions s on s.id = p.subscription_id
order by p.created_at desc limit 5;

-- Le journal brut des notifications reçues :
select transaction_id, event_type, created_at
from payment_events order by created_at desc limit 10;
```

Attendu : `payments.status = 'paid'`, `subscriptions.status = 'active'`,
`expires_at` à trente jours.

### Si rien n'arrive

`payment_events` est écrit **avant** tout traitement : c'est le premier
endroit à regarder.

| Symptôme | Cause probable |
| --- | --- |
| Table vide | Moneroo n'atteint pas l'URL, ou la signature est refusée (401) |
| Événement présent, paiement toujours `pending` | La re-vérification a échoué, ou le montant diverge |
| `payment.failed` enregistré | Le paiement a réellement échoué |

Un domaine local n'est pas joignable par Moneroo : pour éprouver le
webhook en développement, exposez le port par un tunnel, ou testez sur un
déploiement de préproduction.

---

## 7. Bac à sable → production

1. Remplacez `MONEROO_SECRET_KEY` par la clé **live**.
2. Remplacez `MONEROO_WEBHOOK_SECRET` par celui du webhook de production.
3. Déclarez l'URL de webhook du domaine de production.
4. Effectuez **une vraie transaction de petit montant**, et vérifiez en
   base comme ci-dessus.

Il n'y a rien d'autre à changer dans le code : l'URL de base est
identique, et aucun code d'environnement n'y est écrit.

---

## Ce qui protège l'activation

Quatre gardes, dans cet ordre. Aucune ne remplace les autres.

1. **La signature.** `X-Moneroo-Signature` porte un HMAC-SHA256 du corps
   reçu. Comparaison à temps constant : une comparaison qui s'arrête au
   premier octet différent laisse deviner la signature, requête après
   requête.
2. **La re-vérification.** Le corps reçu n'est qu'un signal ; on redemande
   à Moneroo l'état réel de la transaction. Une notification dit
   « regarde », pas « c'est payé ».
3. **Le montant et la devise**, comparés à ce que nous avions enregistré —
   lequel vient de la table `plans`, jamais du navigateur.
4. **L'idempotence**, assurée par la base et non par le code : la fonction
   `confirm_payment` verrouille la ligne de paiement (`FOR UPDATE`) le
   temps de la transaction. Moneroo rejoue jusqu'à trois fois ; la
   deuxième notification relit `status = 'paid'` et repart sans rien
   faire.

Le retour du navigateur sur `/payment/success` n'active **rien**.

## Renouvellement

Payer avant l'échéance ne fait pas perdre les jours restants : la nouvelle
période part de la plus lointaine des deux dates — maintenant, ou
l'échéance en cours.

| Situation | Résultat |
| --- | --- |
| Couvert jusqu'au 20, paiement le 15 | expire le 20 du mois suivant |
| Expiré depuis le 1er, paiement le 15 | expire le 15 + 30 jours |

L'abonnement précédent est clos explicitement au moment du
renouvellement : le laisser « actif » ferait compter deux abonnements pour
une seule période payée.
