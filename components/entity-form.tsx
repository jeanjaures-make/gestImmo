"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardContent, ErrorText } from "@/components/ui/kit";
import type { FormState } from "@/lib/form";

/**
 * Panneau de création repliable, partagé par toutes les listes.
 * Les champs sont passés en `children` depuis le Server Component parent,
 * ce qui permet de les alimenter avec des données déjà chargées côté serveur.
 */
export function EntityForm({
  title,
  triggerLabel,
  submitLabel,
  successMessage,
  action,
  children,
}: {
  title: string;
  triggerLabel: string;
  submitLabel: string;
  successMessage: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // On appelle la Server Action à la main plutôt que via useActionState :
  // cela permet de refermer le panneau au succès sans passer par un effet.
  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await action({}, formData);
      if (result.ok) {
        setError(undefined);
        // Une action qui rend un lien d'activation garde le panneau
        // ouvert : ce lien s'affiche une fois, le refermer le perdrait.
        if (result.link) setLink(result.link);
        else setOpen(false);
        // `ok` peut s'accompagner d'un avertissement (création réussie mais
        // effet secondaire en échec) : on le remonte sans bloquer.
        if (result.error) toast.warning(result.error);
        else toast.success(successMessage);
      } else {
        setError(result.error ?? "Une erreur est survenue.");
      }
    });
  }

  if (!open) {
    return (
      <Button
        onClick={() => {
          setError(undefined);
          setLink(undefined);
          setOpen(true);
        }}
      >
        <Plus className="size-4" />
        {triggerLabel}
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading font-medium">{title}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {link && (
          <div className="mb-4 rounded-lg border border-success/40 bg-success/5 p-3">
            <p className="text-sm font-medium">Lien d&apos;invitation prêt</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aucun e-mail n&apos;a été envoyé. Transmettez ce lien à
              l&apos;intéressé ; il est valable 24 heures et ne sera plus
              affiché.
            </p>
            <input
              readOnly
              value={link}
              aria-label="Lien d'invitation"
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  } catch {
                    toast.error("Copie impossible. Sélectionnez le lien.");
                  }
                }}
              >
                {copied ? "Copié" : "Copier le lien"}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  setLink(undefined);
                  setOpen(false);
                }}
              >
                Terminé
              </Button>
            </div>
          </div>
        )}

        <form action={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {children}
          </div>
          <ErrorText>{error}</ErrorText>
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Enregistrement…" : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
