# Gestion immobilière — biens, locataires, quittances

Le module ajoute une quatrième pièce au produit : la **quittance de
loyer**. Il ne pose aucun mécanisme nouveau — il réemploie ceux des reçus
et des bons de caisse, décrits dans `supabase/schema.sql`.

```
Biens  →  Locataires  →  Quittances  →  Nouvelle quittance
                                            ↓
                          le locataire choisi remplit le reste
                                            ↓
                          A5 paysage, à l'en-tête de l'entreprise
```

## Le parcours

Choisir un locataire renseigne son nom, son téléphone, le bien qu'il
occupe, l'adresse de ce bien et le loyer de son **bail** — qui peut
différer de celui affiché sur le bien : remise consentie, ancien bail non
réévalué. Tout reste modifiable : ce sont des propositions, jamais des
verrous. Un loyer proratisé ou une adresse précisée pour cette
quittance-là sont des cas courants.

Trois choses ne se saisissent pas :

- **le numéro** — `QL-2026-0001`, attribué par un déclencheur PostgreSQL
  sous verrou (`ON CONFLICT DO UPDATE`), comme pour un reçu. Deux
  gestionnaires qui émettent en même temps ne peuvent pas obtenir le
  même. Une valeur envoyée par le client est ignorée : PostgREST est
  joignable directement, le formulaire n'est pas la frontière ;
- **le total** — recalculé côté serveur à partir du loyer, des charges et
  des frais. L'accepter du formulaire permettrait d'émettre une quittance
  dont la somme contredit son propre détail ;
- **le statut d'un bien** — « occupé » ou « disponible » suit ses
  locataires, par déclencheur. Le poser à la main se serait oublié un
  jour sur deux, et la liste des biens libres aurait menti.
  « Indisponible » — travaux, retrait de la location — est une décision
  humaine, jamais écrasée.

## Pourquoi la quittance recopie ce qu'elle sait déjà

`tenant_name`, `property_address`, `landlord_name` dupliquent des valeurs
présentes dans `tenants` et `properties`. C'est délibéré.

Une quittance est une pièce **remise**, opposable, dont l'exemplaire
papier circule. Si le locataire est renommé ou le bien réaffecté l'an
prochain, la quittance de janvier ne doit pas se relire autrement que
l'exemplaire que le locataire détient. Une jointure serait plus
« propre » et produirait, six mois plus tard, un document qui ment.

C'est le même raisonnement que le montant en toutes lettres, stocké et
non recalculé à l'affichage.

## Brouillon, émise, annulée

Un brouillon se corrige. Une quittance émise, non : elle **s'annule**.
L'annulation laisse la ligne, sa date et son motif — et son numéro n'est
jamais réattribué. C'est ce qu'un contrôle attend d'un carnet à souche :
un numéro qui manque sans explication vaut un soupçon.

Le déclencheur `guard_rent_receipt` applique la règle en base, pas dans
l'écran. Il refuse la modification d'une quittance émise, sa suppression,
et toute retouche d'une quittance annulée.

Émettre et corriger reviennent au propriétaire, au gestionnaire et au
caissier ; annuler, au propriétaire et au gestionnaire seuls — exactement
l'échelle des pièces de caisse. Aucun rôle nouveau.

## Le format

**A5 paysage, 210 × 148 mm.** Rien n'est déclaré dans le composant :
`app/globals.css` pose déjà `@page { size: A5 landscape; margin: 8mm }`
et `.sheet` mesure 194 mm, soit 210 moins les marges. La quittance hérite
du gabarit commun à toutes les pièces, et une impression navigateur
produit une **vraie** page A5 — non une A5 posée sur une A4.

La disposition est celle du carnet à souche : identité en haut à gauche,
titre encadré au centre, numéro et lieu-date à droite, puis les mentions
sur lignes de pointillés, les cases de mode de règlement, le cadre
B.P.F, la période, les signatures locataire/agence et le bandeau légal en
pied. Une quittance annulée porte la mention en filigrane.

L'en-tête vient de l'organisation connectée : chaque entreprise imprime
ses quittances sous sa propre identité, avec le même moteur.

## Une numérotation à part, et pourquoi

Réemployer `document_counters` imposerait d'ajouter `rent_receipt` à
l'ENUM `document_kind`. Or `ALTER TYPE … ADD VALUE` interdit d'utiliser
la nouvelle valeur dans la même transaction, et l'éditeur SQL de Supabase
joue tout le collage en une seule : `document_prefix()`, en LANGUAGE SQL,
voit son corps analysé à la création et le script entier serait annulé.

Le compteur est donc distinct — `rent_receipt_counters` — mais le
mécanisme est identique, verrou compris.

## Preuves

`npm run verify:rls`, section « GESTION IMMOBILIÈRE » : 21 assertions.
Cloisonnement entre organisations sur les trois tables, refus de
rattacher un locataire au bien d'une autre entreprise (clé étrangère
composite), numérotation, numéro imposé ignoré, quittance émise
incorrigible et insupprimable, annulation conservée, numéro non
réattribué, et l'échelle des rôles.

`npm run check:db`, section « GESTION IMMOBILIÈRE (property.sql) » :
présence des tables et révocation de `next_rent_receipt_number` pour la
clé anonyme.
