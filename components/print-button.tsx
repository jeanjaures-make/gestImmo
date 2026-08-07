"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/kit";

/**
 * Impression sans dépendance PDF : le navigateur imprime la page, et
 * « Enregistrer en PDF » est disponible nativement sur iOS comme sur
 * Android. Une bibliothèque PDF côté serveur alourdirait le bundle et
 * produirait, au mieux, le même résultat que le moteur de rendu déjà
 * présent dans le navigateur.
 */
export function PrintButton({ label = "Imprimer / Enregistrer en PDF" }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
