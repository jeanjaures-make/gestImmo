"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button, Card, CardContent } from "@/components/ui/kit";

/**
 * Filet de sécurité : aucune erreur applicative ne doit se traduire par une
 * page 500 brute pour l'utilisateur.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isConfigError = error.message.includes("Supabase n'est pas configuré");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <AlertTriangle className="mb-4 size-6 text-warning" />
          <h1 className="font-heading mb-2 text-lg font-semibold">
            {isConfigError
              ? "Configuration incomplète"
              : "Une erreur est survenue"}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {isConfigError
              ? "La connexion à Supabase n'est pas encore configurée."
              : "L'opération n'a pas pu aboutir. Vous pouvez réessayer."}
          </p>

          <div className="flex gap-2">
            <Button size="lg" onClick={reset}>
              Réessayer
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/setup" />}>
              Vérifier la configuration
            </Button>
          </div>

          {error.digest && (
            <p className="mt-6 font-mono text-xs text-muted-foreground">
              Référence : {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
