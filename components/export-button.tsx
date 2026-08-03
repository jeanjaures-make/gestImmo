import { Download } from "lucide-react";

import { Button } from "@/components/ui/kit";

/**
 * Téléchargement CSV d'une liste.
 *
 * Un lien, pas un bouton pilotant du JavaScript : le navigateur gère le
 * téléchargement lui-même, la page ne bouge pas, et cela fonctionne même si
 * le script n'a pas encore été chargé — ce qui, sur un réseau mobile, est le
 * cas pendant les premières secondes.
 *
 * `download` seul ne suffirait pas à nommer le fichier : le nom vient de
 * l'en-tête `Content-Disposition` renvoyé par la route, qui y ajoute le nom
 * de l'organisation et la date.
 */
export function ExportButton({
  dataset,
  label = "Exporter en CSV",
}: {
  dataset: "paiements" | "depenses" | "locataires" | "baux";
  label?: string;
}) {
  return (
    <Button
      variant="outline"
      size="lg"
      render={<a href={`/export/${dataset}`} download />}
    >
      <Download className="size-4" />
      {label}
    </Button>
  );
}
