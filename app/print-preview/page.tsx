import { notFound } from "next/navigation";

import { CashVoucherSheet } from "@/components/print/cash-voucher-sheet";
import { DeliveryNoteSheet } from "@/components/print/delivery-note-sheet";
import { ReceiptSheet } from "@/components/print/receipt-sheet";
import type {
  CashVoucher,
  DeliveryNote,
  DeliveryNoteLine,
  Organization,
  Receipt,
} from "@/lib/types";

/**
 * Banc de rendu des trois pièces imprimées.
 *
 *   npm run dev  puis  http://localhost:3000/print-preview
 *   npx playwright test e2e/print-preview.spec.ts --project=desktop
 *
 * Pourquoi une page plutôt qu'un test de composant : ces pièces se jouent
 * en millimètres, avec les polices du projet, la feuille de style
 * d'impression et le calcul de largeur du navigateur. Un rendu hors du
 * navigateur ne prouverait rien de ce qu'on cherche à vérifier ici.
 *
 * Les données reproduisent les modèles papier fournis par le client, afin
 * que la capture se superpose au scan du carnet. Elles sont figées dans le
 * fichier : le banc ne touche ni à Supabase, ni à la session.
 *
 * La page n'existe pas en production — elle n'a pas d'authentification, et
 * une route de démonstration accessible à tous n'a rien à faire dans un
 * produit facturé.
 */
export const metadata = { title: "Banc de rendu — pièces imprimées" };

/** Logo de substitution : un carré sombre, pour occuper la place réelle. */
const LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
       <rect width="100" height="100" fill="#1f3b57"/>
       <path d="M20 70 L50 25 L80 70 Z" fill="#8bc34a"/>
     </svg>`,
  );

/**
 * Entreprise fictive.
 *
 * Aucune donnée d'une société réelle ici — ni raison sociale, ni adresse,
 * ni téléphone, ni courriel. Les domaines de premier niveau `example.com`
 * sont réservés par la RFC 2606 : ils ne peuvent appartenir à personne.
 *
 * Les chaînes restent volontairement longues : ce banc sert à voir ce qui
 * déborde, et une fixture courte ne montrerait rien.
 */
const ORGANIZATION: Organization = {
  id: "org",
  name: "ENTREPRISE MODÈLE",
  slug: "entreprise-modele",
  logo_url: LOGO,
  legal_form: "S.A.R.L.",
  trade_name: "Société de démonstration et de prestations diverses",
  tagline: "Votre activité, notre outil.",
  activities: [
    "Fournitures générales, petits travaux, installation et mise en service",
    "Maintenance préventive et curative, dépannage sur site",
    "Transport, manutention et prestations diverses",
  ],
  address: "Zone industrielle, lot 12 — voie principale, bâtiment C",
  phone: "(+225) 00 00 00 00 00",
  phone_alt: "00 00 00 00 00",
  email: "contact@example.com",
  email_alt: "comptabilite@example.com",
  website: "www.example.com",
  created_at: "2026-01-01T00:00:00Z",
};

const RECEIPT: Receipt = {
  id: "receipt",
  organization_id: "org",
  number: "REC-2026-0184",
  issued_on: "2026-03-12",
  payer: "Awa Diallo",
  amount: 1_250_000,
  amount_in_words:
    "un million deux cent cinquante mille francs CFA",
  articles: "Acompte sur commande — dossier n° 184, atelier principal",
  advance: 750_000,
  balance: 500_000,
  issued_by: "Karim Benali",
  created_by: null,
  created_at: "2026-03-12T09:00:00Z",
};

const VOUCHER: CashVoucher = {
  id: "voucher",
  organization_id: "org",
  number: "BC-2026-0421",
  issued_on: "2026-03-12",
  direction: "sortie",
  amount: 385_000,
  amount_in_words: "trois cent quatre-vingt-cinq mille francs CFA",
  counterparty: "Fournisseur Général S.A.R.L.",
  reason: "Achat de fournitures pour le chantier nord — lot 3",
  advance: 200_000,
  balance: 185_000,
  ordered_by: "Direction technique",
  settlement: "depot",
  deposit_ref: "BQ 0042-118",
  account: "company",
  created_by: null,
  created_at: "2026-03-12T10:00:00Z",
};

const NOTE: DeliveryNote = {
  id: "note",
  organization_id: "org",
  number: "BS-2026-0257",
  issued_on: "2026-03-12",
  issuer: "Awa Diallo",
  service: "Magasin général",
  nota: "Exemplaire Chauffeur",
  created_by: null,
  created_at: "2026-03-12T11:00:00Z",
};

const LINES: DeliveryNoteLine[] = [
  {
    designation: "Tôle galvanisée 20/10",
    quantity: "12",
    destination: "Chantier nord",
    observations: "Sous bâche",
  },
  {
    designation: "Électrode rutile 3,2 mm",
    quantity: "4 boîtes",
    destination: "Atelier soudure",
    observations: "",
  },
  {
    designation: "Peinture antirouille",
    quantity: "2 x 20 L",
    destination: "Chantier nord",
    observations: "Retour du reliquat",
  },
].map((line, index) => ({
  ...line,
  id: `line-${index}`,
  organization_id: "org",
  delivery_note_id: "note",
  position: index,
  created_at: "2026-03-12T11:00:00Z",
}));

export default function PrintPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    // Fond clair imposé : le banc doit montrer la feuille telle qu'elle
    // sort de l'imprimante, quel que soit le thème du navigateur.
    <main className="min-h-screen bg-neutral-200 p-8 text-black">
      <div className="mx-auto flex w-fit flex-col gap-10">
        {[
          {
            id: "receipt",
            title: "Reçu",
            sheet: (
              <ReceiptSheet receipt={RECEIPT} organization={ORGANIZATION} />
            ),
          },
          {
            id: "cash-voucher",
            title: "Bon de caisse",
            sheet: (
              <CashVoucherSheet
                voucher={VOUCHER}
                organization={ORGANIZATION}
              />
            ),
          },
          {
            id: "delivery-note",
            title: "Bon de sortie",
            sheet: (
              <DeliveryNoteSheet
                note={NOTE}
                lines={LINES}
                organization={ORGANIZATION}
              />
            ),
          },
        ].map(({ id, title, sheet }) => (
          <section key={id} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-neutral-600 print:hidden">
              {title}
            </h2>
            <div data-sheet={id}>{sheet}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
