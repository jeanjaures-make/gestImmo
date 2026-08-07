import { Letterhead } from "@/components/letterhead";
import { DottedField, Sheet } from "@/components/print/sheet";
import { formatDate, type DeliveryNote, type DeliveryNoteLine, type Organization } from "@/lib/types";

/**
 * Le bon de sortie, tel qu'il s'imprime.
 *
 * Entièrement encadré, contrairement aux deux autres pièces : c'est un
 * document qui circule — le chauffeur en garde un exemplaire — et le
 * cadre délimite ce qui doit rester lisible après pliage.
 */

/** Le tableau ne descend jamais en dessous de ce nombre de lignes. */
const MIN_ROWS = 8;

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
  // qu'il porte trois articles ou huit, et il reste de la place pour en
  // ajouter à la main au moment du chargement.
  const blanks = Math.max(0, MIN_ROWS - lines.length);

  return (
    <Sheet className="p-0 text-[11px]">
      <div className="border-[1.5px] border-black">
        <div className="flex items-center justify-between gap-6 px-3 pt-3">
          <Letterhead organization={organization} variant="compact" />
          <div className="text-right">
            <h1 className="text-xl font-extrabold tracking-tight">
              BON DE SORTIE
            </h1>
            <p className="mt-0.5 text-[9px] font-semibold">Nº {note.number}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 py-2 text-sm">
          <DottedField label="DATE :" value={formatDate(note.issued_on)} />
          <DottedField label="NOM ÉMETTEUR :" value={note.issuer} />
          <DottedField label="SERVICE :" value={note.service} />
        </div>

        <table className="w-full table-fixed border-collapse border-t-[1.5px] border-black text-[11px]">
          <thead>
            <tr>
              {["DÉSIGNATION", "QUANTITÉ", "DESTINATION", "OBSERVATIONS"].map(
                (heading, index) => (
                  <th
                    key={heading}
                    className={`border-b-[1.5px] border-black px-2 py-1 text-center font-bold ${
                      index > 0 ? "border-l-[1.5px]" : ""
                    } ${index === 0 ? "w-[34%]" : "w-[22%]"}`}
                  >
                    {heading}
                  </th>
                ),
              )}
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

        <div className="flex justify-between gap-6 border-t-[1.5px] border-black px-3 py-2 text-[11px] font-bold">
          <span>VISA DU CHEF DE SERVICE</span>
          <span>VISA</span>
        </div>
      </div>

      {note.nota && (
        <p className="px-3 pt-1 pb-2 text-[10px] font-bold">
          NOTA <span className="ml-3 font-semibold">{note.nota}</span>
        </p>
      )}
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
    <td
      className={`h-[22px] border-b border-dotted border-black px-2 align-middle ${
        bordered ? "border-l-[1.5px] border-l-black" : ""
      } ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
