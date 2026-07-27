"use client";

import { Printer } from "lucide-react";

/**
 * Génération de quittance sans dépendance PDF : le navigateur imprime la
 * page, et « Enregistrer en PDF » est disponible nativement sur iOS comme
 * sur Android. Une bibliothèque PDF côté serveur alourdirait le bundle
 * pour un résultat équivalent.
 */
export function PrintButton({ label = "Imprimer / Enregistrer en PDF" }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground active:opacity-90 print:hidden"
    >
      <Printer className="size-4" />
      {label}
    </button>
  );
}
