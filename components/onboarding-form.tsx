"use client";

import { useActionState, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Building2, ImagePlus, Trash2 } from "lucide-react";

import { Button, ErrorText, Field, Input } from "@/components/ui/kit";
import {
  createOrganization,
  type OnboardingState,
} from "@/app/onboarding/actions";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/logo";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      aria-busy={pending}
      className="w-full"
    >
      {pending ? "Création de votre espace…" : "Ouvrir mon espace"}
    </Button>
  );
}

/**
 * Sélecteur de logo.
 *
 * Le fichier n'est pas envoyé tout de suite : il voyage avec le
 * formulaire. L'aperçu est produit localement par `URL.createObjectURL`,
 * sans aller-retour réseau — voir son logo apparaître à l'instant fait une
 * bonne part de la confiance qu'inspire l'écran.
 */
function LogoPicker() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function choose(file: File | undefined) {
    setProblem(null);
    if (!file) return;

    // Mêmes bornes que côté serveur — celles-ci évitent un envoi inutile,
    // celles-là font foi.
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
      setProblem("Formats acceptés : PNG, JPEG, WebP ou SVG.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setProblem("Le fichier dépasse 1 Mo.");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setName(file.name);
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setName(null);
    setProblem(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Logo de l&apos;organisation
      </span>

      <div className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {preview ? (
            // `unoptimized` : l'aperçu est un blob local, il n'y a rien à
            // optimiser côté serveur et Next ne saurait pas le traiter.
            <Image
              src={preview}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="size-full object-contain"
            />
          ) : (
            <Building2 className="size-6 text-muted-foreground" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            id={id}
            type="file"
            name="logo"
            accept={LOGO_TYPES.join(",")}
            onChange={(e) => choose(e.target.files?.[0])}
            className="sr-only"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-3.5" />
              {preview ? "Changer" : "Ajouter un logo"}
            </Button>
            {preview && (
              <Button type="button" variant="ghost" size="sm" onClick={clear}>
                <Trash2 className="size-3.5" />
                Retirer
              </Button>
            )}
          </div>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {name ?? "Facultatif · PNG, JPEG, WebP ou SVG · 1 Mo maximum"}
          </p>
        </div>
      </div>

      {problem && <ErrorText>{problem}</ErrorText>}
    </div>
  );
}

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary"
        >
          {index}
        </span>
        <div>
          <h2 className="font-heading text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:pl-9">{children}</div>
    </section>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    createOrganization,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <Step
        index={1}
        title="Votre organisation"
        description="Le nom que verront vos locataires sur leurs quittances."
      >
        <Field label="Nom de l'organisation">
          <Input
            name="name"
            placeholder="Patrimoine Vallier"
            autoComplete="organization"
            required
            autoFocus
            className="h-11"
          />
        </Field>
        <LogoPicker />
      </Step>

      <Step
        index={2}
        title="Vous"
        description="Apparaît dans le journal d'audit et auprès de votre équipe."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prénom">
            <Input
              name="firstname"
              placeholder="Awa"
              autoComplete="given-name"
              className="h-11"
            />
          </Field>
          <Field label="Nom">
            <Input
              name="lastname"
              placeholder="Diallo"
              autoComplete="family-name"
              className="h-11"
            />
          </Field>
        </div>
      </Step>

      <Step
        index={3}
        title="Votre premier bien"
        description="Facultatif, mais votre tableau de bord ne sera pas vide."
      >
        <Field
          label="Nom de l'immeuble"
          hint="Une villa ou un appartement isolé conviennent aussi."
        >
          <Input
            name="building_name"
            placeholder="Résidence Vallier"
            className="h-11"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Ville">
            <Input name="building_city" placeholder="Dakar" className="h-11" />
          </Field>
          <Field label="Premier logement" hint="Numéro ou nom du lot.">
            <Input name="apartment_number" placeholder="A12" className="h-11" />
          </Field>
        </div>
      </Step>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton />
    </form>
  );
}
