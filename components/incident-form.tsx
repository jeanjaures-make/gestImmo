"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  ErrorText,
  Field,
  Input,
  NativeSelect,
  Textarea,
} from "@/components/ui/kit";
import { declareIncident } from "@/app/portal/incidents/actions";
import { MAINTENANCE_PRIORITY_LABELS } from "@/lib/types";
import type { FormState } from "@/lib/form";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 font-medium text-primary-foreground active:opacity-90 disabled:opacity-60"
    >
      {pending ? "Envoi…" : "Envoyer la déclaration"}
    </button>
  );
}

export function IncidentForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    declareIncident,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Que se passe-t-il ?">
        <Input
          name="title"
          placeholder="Fuite sous l'évier"
          required
          maxLength={160}
          // La hauteur par défaut des champs shadcn est pensée desktop.
          className="h-12 text-base"
        />
      </Field>

      <Field label="Détails" hint="Localisation, depuis quand, gravité…">
        <Textarea
          name="description"
          rows={5}
          placeholder="Décrivez le problème le plus précisément possible."
          className="text-base"
        />
      </Field>

      <Field label="Urgence">
        <NativeSelect
          name="priority"
          defaultValue="medium"
          className="h-12 text-base"
        >
          {Object.entries(MAINTENANCE_PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <ErrorText>{state.error}</ErrorText>

      <SubmitButton />
    </form>
  );
}
