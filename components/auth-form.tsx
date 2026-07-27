"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, ErrorText } from "@/components/ui/kit";

export type AuthState = { error?: string; message?: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Un instant…" : label}
    </Button>
  );
}

export function AuthForm({
  action,
  submitLabel,
  children,
  secondaryAction,
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  submitLabel: string;
  children: ReactNode;
  secondaryAction?: ReactNode;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}

      <ErrorText>{state.error}</ErrorText>
      {state.message && (
        <p className="text-sm text-success" role="status">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <SubmitButton label={submitLabel} />
        {secondaryAction}
      </div>
    </form>
  );
}
