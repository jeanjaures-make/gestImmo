/**
 * Contenu des pages légales.
 *
 * ─── Ce que ces textes sont, et ne sont pas ─────────────────────────────
 * Le fond est rédigé ici parce qu'il décrit ce que le logiciel fait
 * réellement : quelles données il enregistre, où elles sont hébergées,
 * combien de temps elles vivent, qui peut les lire. Personne d'autre que
 * l'auteur du code ne peut écrire cette partie avec exactitude, et un
 * modèle générique recopié d'ailleurs serait faux sur la plupart des
 * points.
 *
 * L'identité de l'éditeur, en revanche, ne s'invente pas. Elle reste en
 * `TODO` — affichés en évidence, pour qu'aucun ne passe inaperçu.
 *
 * Ces textes engagent juridiquement : ils doivent être relus par un
 * conseil avant toute commercialisation. Tant que des `TODO` subsistent,
 * la page se déclare explicitement comme un projet et refuse l'indexation.
 */

export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "todo"; text: string };

export type Section = {
  heading: string;
  blocks: Block[];
};

export type LegalDocument = {
  title: string;
  intro: string;
  sections: Section[];
};

const HÉBERGEMENT: Block[] = [
  {
    kind: "paragraph",
    text:
      "Les données sont enregistrées dans une base PostgreSQL gérée par Supabase, et les fichiers déposés (baux, pièces d'identité, factures) dans son service de stockage. L'application est servie par Vercel. Ces deux prestataires agissent comme sous-traitants au sens du RGPD.",
  },
  {
    kind: "todo",
    text:
      "Préciser la région d'hébergement exacte du projet Supabase et du déploiement Vercel, ainsi que les références des accords de sous-traitance signés avec chacun.",
  },
];

export const DOCUMENTS: Record<string, LegalDocument> = {
  "mentions-legales": {
    title: "Mentions légales",
    intro:
      "Informations sur l'éditeur du site, son hébergeur et les conditions d'utilisation.",
    sections: [
      {
        heading: "Éditeur",
        blocks: [
          {
            kind: "todo",
            text:
              "Dénomination sociale, forme juridique, capital social, adresse du siège, numéro d'immatriculation, numéro de TVA intracommunautaire, et nom du directeur de la publication.",
          },
        ],
      },
      {
        heading: "Contact",
        blocks: [
          {
            kind: "todo",
            text:
              "Adresse électronique et numéro de téléphone auxquels l'éditeur peut être joint.",
          },
        ],
      },
      {
        heading: "Hébergement",
        blocks: HÉBERGEMENT,
      },
      {
        heading: "Propriété intellectuelle",
        blocks: [
          {
            kind: "paragraph",
            text:
              "L'ensemble des éléments composant la plateforme — code, interfaces, textes, identité visuelle — demeure la propriété de l'éditeur. Les données saisies par un utilisateur, en revanche, lui appartiennent : l'éditeur n'en acquiert aucun droit et n'en fait aucun usage étranger à la fourniture du service.",
          },
        ],
      },
      {
        heading: "Médiation de la consommation",
        blocks: [
          {
            kind: "todo",
            text:
              "Coordonnées du médiateur de la consommation, si le service est proposé à des particuliers.",
          },
        ],
      },
    ],
  },

  confidentialite: {
    title: "Politique de confidentialité",
    intro:
      "Quelles données la plateforme enregistre, pourquoi, combien de temps, et ce que vous pouvez exiger.",
    sections: [
      {
        heading: "Deux catégories de personnes concernées",
        blocks: [
          {
            kind: "paragraph",
            text:
              "La plateforme traite les données de deux publics distincts, et cette distinction commande tout le reste. D'un côté les utilisateurs professionnels — propriétaires, gestionnaires, comptables — qui ouvrent un compte. De l'autre les locataires, dont les données sont saisies par leur gestionnaire et qui n'ont pas toujours souscrit eux-mêmes.",
          },
          {
            kind: "paragraph",
            text:
              "Pour les données des locataires, l'organisation cliente est responsable de traitement et l'éditeur agit comme sous-traitant. Il appartient donc à chaque organisation d'informer ses locataires et de recueillir, lorsque c'est nécessaire, leur consentement.",
          },
        ],
      },
      {
        heading: "Données enregistrées",
        blocks: [
          {
            kind: "paragraph",
            text: "Pour un utilisateur professionnel :",
          },
          {
            kind: "list",
            items: [
              "Adresse électronique, servant d'identifiant de connexion",
              "Prénom et nom, s'ils sont renseignés",
              "Rôle au sein de l'organisation",
              "Journal des connexions : date, adresse IP, navigateur et système déclarés — réussies comme refusées",
            ],
          },
          {
            kind: "paragraph",
            text: "Pour un locataire :",
          },
          {
            kind: "list",
            items: [
              "Prénom, nom, téléphone, adresse électronique",
              "Numéro de pièce d'identité, lorsque le gestionnaire le renseigne",
              "Bail : logement, loyer, charges, dépôt de garantie, dates",
              "Échéances de loyer, règlements déclarés et encaissements",
              "Interventions signalées sur le logement",
              "Documents déposés par le gestionnaire ou par le locataire",
            ],
          },
          {
            kind: "paragraph",
            text:
              "Aucune donnée bancaire n'est enregistrée : la plateforme ne perçoit aucun paiement et ne se raccorde à aucun prestataire de paiement. Un règlement est déclaré puis validé par un humain.",
          },
        ],
      },
      {
        heading: "Finalités et bases légales",
        blocks: [
          {
            kind: "list",
            items: [
              "Fourniture du service de gestion locative — exécution du contrat conclu avec l'organisation cliente",
              "Authentification et sécurité des comptes, dont le journal des connexions — intérêt légitime de l'éditeur à prévenir les accès frauduleux",
              "Journal d'audit des modifications — intérêt légitime, et obligation de traçabilité de l'organisation cliente",
              "Diagnostic des incidents techniques — intérêt légitime au bon fonctionnement du service",
            ],
          },
          {
            kind: "paragraph",
            text:
              "Aucune donnée n'est utilisée à des fins publicitaires, ni cédée, ni revendue. Aucun traceur publicitaire n'est déposé, et la plateforme ne fait appel à aucun service de mesure d'audience tiers.",
          },
        ],
      },
      {
        heading: "Cloisonnement entre organisations",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Chaque organisation ne peut accéder qu'à ses propres données. Ce cloisonnement n'est pas seulement appliqué par l'interface mais par la base de données elle-même, au moyen de politiques de sécurité au niveau des lignes. Un locataire disposant d'un accès ne voit que son bail, ses échéances, ses documents et ses interventions — jamais ceux d'un autre, ni les dépenses de l'organisation, ni le journal d'audit.",
          },
          {
            kind: "paragraph",
            text:
              "Ce cloisonnement est vérifié automatiquement à chaque modification du code, par une suite d'assertions exécutées contre une base réelle.",
          },
        ],
      },
      {
        heading: "Destinataires",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Les données ne sont accessibles qu'aux membres de l'organisation cliente, selon leur rôle, et au locataire concerné pour ce qui lui appartient. L'éditeur n'y accède pas dans le cours normal de l'exploitation. Un accès technique ponctuel, à des fins de diagnostic et à la demande du client, reste possible.",
          },
          {
            kind: "paragraph",
            text:
              "Les signalements d'incident transmis à l'outil de supervision ne contiennent que des identifiants techniques : jamais un nom, une adresse électronique ou le contenu d'un document.",
          },
        ],
      },
      {
        heading: "Durées de conservation",
        blocks: [
          {
            kind: "list",
            items: [
              "Données de gestion locative : pendant toute la durée du contrat avec l'organisation cliente",
              "Journal des connexions : douze mois",
              "Journal d'audit des modifications : durée du contrat, puis archivage selon les obligations comptables de l'organisation",
              "Après résiliation : suppression définitive à l'issue du délai de réversibilité prévu aux conditions générales",
            ],
          },
          {
            kind: "todo",
            text:
              "Arrêter le délai de réversibilité après résiliation, et le reporter à l'identique dans les conditions générales.",
          },
        ],
      },
      {
        heading: "Sous-traitants et hébergement",
        blocks: HÉBERGEMENT,
      },
      {
        heading: "Sécurité",
        blocks: [
          {
            kind: "list",
            items: [
              "Communications chiffrées de bout en bout (HTTPS)",
              "Mots de passe stockés sous forme de condensat par le fournisseur d'authentification, jamais en clair",
              "Documents déposés dans un espace privé ; leur téléchargement passe par un lien signé valable soixante secondes",
              "Cloisonnement appliqué par la base de données, indépendamment de l'interface",
              "Journalisation des accès et des modifications",
            ],
          },
        ],
      },
      {
        heading: "Vos droits",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Toute personne dispose d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité sur les données la concernant. Un locataire adresse sa demande à son gestionnaire, responsable de traitement ; l'éditeur l'assiste pour y répondre.",
          },
          {
            kind: "paragraph",
            text:
              "Un utilisateur professionnel peut à tout moment exporter ses données depuis l'application, aux formats ouverts, et demander la suppression de son organisation — laquelle efface l'ensemble des données rattachées.",
          },
          {
            kind: "todo",
            text:
              "Adresse à laquelle les demandes sont adressées, coordonnées du délégué à la protection des données s'il en est désigné, et autorité de contrôle compétente.",
          },
        ],
      },
    ],
  },

  cgu: {
    title: "Conditions générales d'utilisation",
    intro: "Règles d'accès et d'usage de la plateforme.",
    sections: [
      {
        heading: "Objet",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Les présentes conditions régissent l'accès à la plateforme et son utilisation. Elles sont acceptées lors de la création d'un compte.",
          },
        ],
      },
      {
        heading: "Le service",
        blocks: [
          {
            kind: "paragraph",
            text:
              "La plateforme permet de gérer un parc immobilier locatif : immeubles, logements, locataires, baux, échéances de loyer, dépenses, interventions et documents. Elle met également à disposition des locataires un espace où consulter leur bail, leurs quittances et leurs interventions, et déclarer leurs règlements.",
          },
          {
            kind: "paragraph",
            text:
              "La plateforme n'encaisse aucun paiement. Une déclaration de règlement par un locataire ne vaut pas encaissement tant qu'un gestionnaire ne l'a pas validée. L'éditeur n'intervient à aucun moment dans la relation contractuelle entre un bailleur et son locataire, et ne fournit ni conseil juridique, ni conseil fiscal.",
          },
        ],
      },
      {
        heading: "Comptes et rôles",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Chaque compte est nominatif. Son titulaire est responsable de la confidentialité de son mot de passe et des actions accomplies depuis son compte. Les rôles — propriétaire, gestionnaire, comptable, lecteur — déterminent ce que chacun peut consulter et modifier ; leur attribution relève du propriétaire de l'organisation.",
          },
          {
            kind: "paragraph",
            text:
              "L'accès d'un locataire est ouvert par son gestionnaire au moyen d'un lien d'activation, que celui-ci lui transmet par le canal de son choix. Ce lien vaut identifiant : il ne doit être communiqué qu'à son destinataire.",
          },
        ],
      },
      {
        heading: "Obligations de l'utilisateur",
        blocks: [
          {
            kind: "list",
            items: [
              "N'enregistrer que des données qu'il est en droit de traiter, et informer les personnes concernées",
              "Ne pas tenter d'accéder aux données d'une autre organisation, ni d'en contourner le cloisonnement",
              "Ne pas déposer de contenu illicite ni de logiciel malveillant",
              "Ne pas soumettre la plateforme à une charge manifestement disproportionnée",
            ],
          },
        ],
      },
      {
        heading: "Disponibilité et maintenance",
        blocks: [
          {
            kind: "paragraph",
            text:
              "L'éditeur met en œuvre les moyens raisonnables pour assurer la disponibilité du service, sans garantie d'un fonctionnement ininterrompu. Des interruptions peuvent survenir pour maintenance, ou du fait d'un prestataire d'hébergement.",
          },
          {
            kind: "todo",
            text:
              "Indiquer si un niveau de service est garanti et, le cas échéant, son taux de disponibilité et ses contreparties.",
          },
        ],
      },
      {
        heading: "Tarifs",
        blocks: [
          {
            kind: "todo",
            text:
              "Décrire l'offre commerciale effectivement appliquée : période d'essai, prix, périodicité de facturation, modalités de règlement et conditions de révision. Ce paragraphe doit correspondre exactement à ce qui est affiché sur la page de tarifs.",
          },
        ],
      },
      {
        heading: "Responsabilité",
        blocks: [
          {
            kind: "paragraph",
            text:
              "L'utilisateur demeure seul responsable de l'exactitude des données qu'il enregistre et des décisions qu'il prend à partir de la plateforme. L'éditeur ne répond pas des dommages indirects, notamment une perte d'exploitation ou un manque à gagner.",
          },
          {
            kind: "todo",
            text:
              "Fixer le plafond de responsabilité, généralement rapporté aux sommes versées au cours des douze derniers mois.",
          },
        ],
      },
      {
        heading: "Résiliation et réversibilité",
        blocks: [
          {
            kind: "paragraph",
            text:
              "L'utilisateur peut cesser d'utiliser le service à tout moment. Avant toute suppression, il lui appartient d'exporter ses données depuis l'application ; les listes principales s'exportent aux formats ouverts, et les documents déposés restent téléchargeables.",
          },
          {
            kind: "paragraph",
            text:
              "La suppression d'une organisation efface définitivement l'ensemble des données rattachées. Cette opération est irréversible.",
          },
        ],
      },
      {
        heading: "Droit applicable",
        blocks: [
          {
            kind: "todo",
            text:
              "Droit applicable et juridiction compétente en cas de litige, ainsi que les modalités de règlement amiable préalable.",
          },
        ],
      },
    ],
  },
};

export type Slug = keyof typeof DOCUMENTS;

/** Vrai tant qu'un point reste à compléter : la page se dit alors « projet ». */
export function isDraft(document: LegalDocument): boolean {
  return document.sections.some((s) => s.blocks.some((b) => b.kind === "todo"));
}

export function countTodos(document: LegalDocument): number {
  return document.sections.reduce(
    (total, s) => total + s.blocks.filter((b) => b.kind === "todo").length,
    0,
  );
}
