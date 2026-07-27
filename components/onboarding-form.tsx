"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, ErrorText, Field, Input } from "@/components/ui/kit";
import {
  createOrganization,
  type OnboardingState,
} from "@/app/onboarding/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Création…" : "Créer l'organisation"}
    </Button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    createOrganization,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Nom de l'organisation"
        hint="Votre société de gestion, ou simplement votre nom."
      >
        <Input name="name" placeholder="Patrimoine Vallier" required />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Prénom">
          <Input name="firstname" placeholder="Awa" />
        </Field>
        <Field label="Nom">
          <Input name="lastname" placeholder="Diallo" />
        </Field>
      </div>

      <ErrorText>{state.error}</ErrorText>

      <SubmitButton />
    </form>
  );
}
