import { DeliveryLines } from "@/components/delivery-lines";
import { Field, Input } from "@/components/ui/kit";
import type { DeliveryNote, DeliveryNoteLine } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

/** Mention de pied par défaut : celle des carnets à souche. */
const DEFAULT_NOTA = "Exemplaire chauffeur";

export function DeliveryNoteFields({
  note,
  lines,
}: {
  note?: DeliveryNote;
  lines?: DeliveryNoteLine[];
}) {
  return (
    <>
      <Field label="Date">
        <Input
          name="issued_on"
          type="date"
          required
          defaultValue={note?.issued_on ?? today()}
        />
      </Field>

      <Field label="Nom de l'émetteur">
        <Input
          name="issuer"
          required
          maxLength={160}
          placeholder="Awa Diallo"
          defaultValue={note?.issuer}
        />
      </Field>

      <Field label="Service">
        <Input
          name="service"
          maxLength={120}
          placeholder="Magasin"
          defaultValue={note?.service}
        />
      </Field>

      <Field label="Nota" hint="La mention imprimée en pied de bon.">
        <Input
          name="nota"
          maxLength={160}
          defaultValue={note?.nota ?? DEFAULT_NOTA}
        />
      </Field>

      {/* Le tableau occupe toute la largeur : réparti sur deux colonnes de
          formulaire, il deviendrait illisible dès la première désignation
          un peu longue. */}
      <div className="sm:col-span-2 lg:col-span-3">
        <DeliveryLines lines={lines} />
      </div>
    </>
  );
}
