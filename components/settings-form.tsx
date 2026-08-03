"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardContent,
  ErrorText,
} from "@/components/ui/kit";
import type { FormState } from "@/lib/form";

/**
 * Section de réglages : un titre, une explication, des champs, un bouton.
 *
 * Contrairement à `EntityForm`, le formulaire est toujours déplié. On ne
 * vient pas ici pour créer une ligne de plus mais pour corriger une valeur
 * existante : la masquer derrière un bouton « Modifier » ajouterait un
 * geste sans rien clarifier.
 */
export function SettingsForm({
  title,
  description,
  submitLabel,
  successMessage,
  action,
  /** Vide les champs après succès — pour un mot de passe, jamais un nom. */
  resetOnSuccess = false,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  successMessage: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  resetOnSuccess?: boolean;
  children: ReactNode;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await action({}, formData);

      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }

      setError(undefined);
      // `ok` avec un message : l'essentiel est enregistré, un effet
      // secondaire a échoué. On le dit sans faire croire à un échec.
      if (result.error) toast.warning(result.error);
      else toast.success(successMessage);
      if (resetOnSuccess) formRef.current?.reset();
    });
  }

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-heading font-medium">{title}</h2>
        {description && (
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {description}
          </p>
        )}

        <form
          ref={formRef}
          action={submit}
          className={description ? "flex flex-col gap-4" : "mt-4 flex flex-col gap-4"}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
          <ErrorText>{error}</ErrorText>
          <div>
            <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
              {pending ? "Enregistrement…" : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
