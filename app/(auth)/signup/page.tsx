import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, Field, Input } from "@/components/ui/kit";
import { signUp } from "../login/actions";

export const metadata = { title: "Créer un compte — ImmoOps" };

export default function SignUpPage() {
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">
          Créer une organisation
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Vous nommerez votre organisation à l&apos;étape suivante.
        </p>

        <AuthForm action={signUp} submitLabel="Créer mon compte">
          <Field label="Adresse e-mail">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              required
            />
          </Field>

          <Field
            label="Mot de passe"
            hint="8 caractères minimum."
          >
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </Field>
        </AuthForm>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
