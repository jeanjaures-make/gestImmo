import { Letterhead } from "@/components/letterhead";
import { DottedField, Sheet } from "@/components/print/sheet";
import { formatDate, type DeliveryNote, type DeliveryNoteLine, type Organization } from "@/lib/types";

/**
 * Le bon de sortie, tel qu'il s'imprime.
 *
 * Entièrement encadré, contrairement aux deux autres pièces : c'est un
 * document qui circule — le chauffeur en garde un exemplaire — et le
 * cadre délimite ce qui doit rester lisible après pliage. Les visas et la
 * mention NOTA sont posés hors du cadre : ils sont apposés après coup, sur
 * la marge, une fois le bon détaché.
 */

/** Le tableau ne descend jamais en dessous de ce nombre de lignes. */
const MIN_ROWS = 7;

/**
 * Les colonnes du tableau, dans l'ordre et avec leur largeur.
 *
 * La désignation prend le double de la quantité : c'est elle qui porte du
 * texte libre — « tôle galvanisée 20/10 » —, là où la quantité tient en
 * trois caractères.
 */
const COLUMNS = [
  { heading: "DÉSIGNATION", width: "31%" },
  { heading: "QUANTITÉ", width: "16%" },
  { heading: "DESTINATION", width: "25%" },
  { heading: "OBSERVATIONS", width: "28%" },
];

export function DeliveryNoteSheet({
  note,
  lines,
  organization,
}: {
  note: DeliveryNote;
  lines: DeliveryNoteLine[];
  organization: Organization;
}) {
  // Des lignes vides complètent le tableau : le bon garde la même allure
  // qu'il porte trois articles ou sept, et il reste de la place pour en
  // ajouter à la main au moment du chargement.
  const blanks = Math.max(0, MIN_ROWS - lines.length);

  return (
    <Sheet className="p-0 text-[11px]">
      <div className="border-[1.5px] border-black">
        <div className="flex items-center gap-4 px-3 pt-3">
          <div className="w-[34%] shrink-0">
            <Letterhead organization={organization} variant="identity" />
          </div>

          <div className="flex-1 text-center">
            <h1 className="text-xl font-extrabold tracking-tight">
              BON DE SORTIE
            </h1>
            <p className="mt-0.5 text-[9px] font-semibold">Nº {note.number}</p>
          </div>

          {/* Colonne fantôme, de la largeur du bloc d'identité : elle
              recentre le titre sur la feuille entière plutôt que sur la
              place qui reste à droite du logo. */}
          <div className="w-[34%] shrink-0" aria-hidden />
        </div>

        <div className="flex flex-col gap-3 px-3 py-3 text-sm">
          <DottedField label="DATE :" value={formatDate(note.issued_on)} />
          <DottedField label="NOM ÉMETTEUR :" value={note.issuer} />
          <DottedField label="SERVICE :" value={note.service} />
        </div>

        <table className="w-full table-fixed border-collapse border-t-[1.5px] border-black text-[11px]">
          <thead>
            <tr>
              {COLUMNS.map(({ heading, width }, index) => (
                <th
                  key={heading}
                  style={{ width }}
                  className={`border-b-[1.5px] border-black px-2 py-1 text-center font-bold ${
                    index > 0 ? "border-l-[1.5px]" : ""
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <Cell>{line.designation}</Cell>
                <Cell bordered className="text-center">
                  {line.quantity}
                </Cell>
                <Cell bordered>{line.destination}</Cell>
                <Cell bordered>{line.observations}</Cell>
              </tr>
            ))}
            {Array.from({ length: blanks }, (_, index) => (
              <tr key={`blank-${index}`}>
                <Cell />
                <Cell bordered />
                <Cell bordered />
                <Cell bordered />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between gap-6 px-3 pt-2 text-[11px] font-bold">
        <span>VISA DU CHEF DE SERVICE</span>
        <span>VISA</span>
      </div>

      {/* La mention est toujours imprimée, valeur ou non : sur la souche
          elle est pré-imprimée, et une ligne vide s'annote au stylo au
          moment du chargement. */}
      <DottedField
        label="NOTA"
        value={note.nota}
        className="max-w-[60%] px-3 pt-1 pb-2 text-[10px]"
      />
    </Sheet>
  );
}

function Cell({
  children,
  bordered,
  className,
}: {
  children?: React.ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    // 33 px ≈ 8,7 mm : la hauteur de ligne de la souche. Les cases doivent
    // rester assez hautes pour qu'on y ajoute un article au stylo sur le
    // quai de chargement, et c'est ce qui fait que le tableau occupe la
    // feuille au lieu de se tasser en haut.
    <td
      className={`h-[33px] border-b border-dotted border-black px-2 align-middle ${
        bordered ? "border-l-[1.5px] border-l-black" : ""
      } ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
