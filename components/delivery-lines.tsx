"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button, Input } from "@/components/ui/kit";
import type { DeliveryNoteLine } from "@/lib/types";

type Draft = {
  /** Clé de rendu locale : les lignes n'ont pas d'identifiant tant qu'elles
   *  ne sont pas enregistrées, et l'index changerait à chaque suppression. */
  key: number;
  designation: string;
  quantity: string;
  destination: string;
  observations: string;
};

const EMPTY = {
  designation: "",
  quantity: "",
  destination: "",
  observations: "",
};

/** Le tableau démarre avec trois lignes : la plupart des sorties en font moins. */
const INITIAL_ROWS = 3;

/**
 * Le tableau d'articles d'un bon de sortie.
 *
 * Les quatre colonnes portent le même nom sur toutes les lignes : le
 * `FormData` contient donc quatre listes parallèles, que
 * `readDeliveryLines` recompose côté serveur. C'est plus simple qu'un
 * index dans le nom des champs, et cela survit à la suppression d'une
 * ligne du milieu — un `article[2]` laissé vacant obligerait à
 * renuméroter tout le reste.
 *
 * Les lignes entièrement vides sont ignorées à l'enregistrement : on peut
 * en laisser traîner sans les effacer une à une.
 */
export function DeliveryLines({ lines }: { lines?: DeliveryNoteLine[] }) {
  const [rows, setRows] = useState<Draft[]>(() =>
    lines?.length
      ? lines.map((line, index) => ({ key: index, ...line }))
      : Array.from({ length: INITIAL_ROWS }, (_, key) => ({ key, ...EMPTY })),
  );

  function addRow() {
    setRows((current) => [
      ...current,
      // `Date.now()` plutôt que `length` : deux ajouts après suppression
      // produiraient sinon deux fois la même clé.
      { key: Date.now(), ...EMPTY },
    ]);
  }

  function removeRow(key: number) {
    setRows((current) =>
      // Jamais zéro ligne : un tableau sans ligne n'offre plus de prise
      // pour recommencer la saisie.
      current.length > 1 ? current.filter((row) => row.key !== key) : current,
    );
  }

  function update(key: number, field: keyof typeof EMPTY, value: string) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Articles sortis
      </span>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-[34%] font-medium">Désignation</th>
              <th className="w-[16%] font-medium">Quantité</th>
              <th className="w-[22%] font-medium">Destination</th>
              <th className="w-[22%] font-medium">Observations</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td className="pr-1.5">
                  <Input
                    name="designation"
                    value={row.designation}
                    onChange={(e) =>
                      update(row.key, "designation", e.target.value)
                    }
                    aria-label={`Désignation, ligne ${index + 1}`}
                    placeholder="Tôles galvanisées"
                  />
                </td>
                <td className="pr-1.5">
                  <Input
                    name="quantity"
                    value={row.quantity}
                    onChange={(e) => update(row.key, "quantity", e.target.value)}
                    aria-label={`Quantité, ligne ${index + 1}`}
                    placeholder="12"
                  />
                </td>
                <td className="pr-1.5">
                  <Input
                    name="destination"
                    value={row.destination}
                    onChange={(e) =>
                      update(row.key, "destination", e.target.value)
                    }
                    aria-label={`Destination, ligne ${index + 1}`}
                    placeholder="Chantier Koumassi"
                  />
                </td>
                <td className="pr-1.5">
                  <Input
                    name="observations"
                    value={row.observations}
                    onChange={(e) =>
                      update(row.key, "observations", e.target.value)
                    }
                    aria-label={`Observations, ligne ${index + 1}`}
                  />
                </td>
                <td>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length === 1}
                    aria-label={`Retirer la ligne ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          Ajouter une ligne
        </Button>
      </div>
    </div>
  );
}
