"use client";

import {
  useActionState,
  useId,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff } from "lucide-react";

import { Button, Input, Label } from "@/components/ui/kit";
import { PASSWORD_RULES } from "@/lib/validation";
import { cn } from "@/lib/utils";

export type AuthState = { error?: string; message?: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      // `aria-busy` : un lecteur d'écran annonce l'attente au lieu de
      // laisser croire que le clic n'a rien produit.
      aria-busy={pending}
      className="w-full"
    >
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
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {children}

      {state.error && (
        // `role="alert"` : l'erreur est annoncée dès son apparition, sans
        // que l'utilisateur ait à repartir en exploration du formulaire.
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state.message && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-success/10 p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
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

/**
 * Champ e-mail.
 *
 * La validation ne se déclenche qu'à la sortie du champ : signaler
 * « adresse invalide » dès la première lettre saisie est exact, et
 * insupportable.
 */
export function EmailField({
  defaultValue,
  autoFocus,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");

  const invalid = touched && value.length > 0 && !/^[^@\s]+@[^@\s.]+\.\S+$/.test(value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Adresse e-mail</Label>
      <Input
        id={id}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus={autoFocus}
        required
        placeholder="vous@exemple.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className="h-11"
      />
      {invalid && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          Cette adresse semble incomplète.
        </p>
      )}
    </div>
  );
}

/**
 * Champ mot de passe.
 *
 * `showRules` n'apparaît qu'à la création : à la connexion, rappeler les
 * règles ne sert à rien — le mot de passe existe déjà — et suggère à tort
 * que l'échec vient de leur non-respect.
 */
export function PasswordField({
  name = "password",
  label = "Mot de passe",
  autoComplete = "current-password",
  showRules = false,
  hint,
}: {
  name?: string;
  label?: string;
  autoComplete?: "current-password" | "new-password";
  showRules?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {hint}
      </div>

      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 pr-12"
          aria-describedby={showRules ? `${id}-rules` : undefined}
        />
        {/* Bouton à deux états : le nom accessible reste constant, l'état
            est porté par `aria-pressed`. C'est le motif recommandé, et il
            évite surtout que ce bouton porte le même nom que le champ.
            « Afficher le mot de passe » entrait en collision avec
            « Mot de passe » — deux contrôles au nom quasi identique dans un
            même formulaire, ce qui rend l'énoncé ambigu pour qui pilote à
            la voix et bruyant au lecteur d'écran. */}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label="Afficher en clair"
          title={visible ? "Masquer" : "Afficher en clair"}
          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {showRules && (
        <ul id={`${id}-rules`} className="mt-1 flex flex-col gap-1">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(value);
            return (
              <li
                key={rule.label}
                className={cn(
                  "flex items-center gap-2 text-xs transition-colors",
                  met ? "text-success" : "text-muted-foreground",
                )}
              >
                <Check
                  aria-hidden
                  className={cn("size-3.5", !met && "opacity-30")}
                />
                {rule.label}
                {/* Le texte lu par les lecteurs d'écran dit l'état, que la
                    couleur seule ne transmet pas. */}
                <span className="sr-only">{met ? " : rempli" : " : manquant"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
