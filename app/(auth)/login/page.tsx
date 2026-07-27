import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, Field, Input } from "@/components/ui/kit";
import { signIn } from "./actions";

export const metadata = { title: "Connexion — ImmoOps" };

export default function LoginPage() {
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">Connexion</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Accédez à votre espace de pilotage.
        </p>

        <AuthForm action={signIn} submitLabel="Se connecter">
          <Field label="Adresse e-mail">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              required
            />
          </Field>

          <Field label="Mot de passe">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </Field>
        </AuthForm>

        <div className="mt-6 flex flex-col gap-2 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Mot de passe oublié ?
          </Link>
          <Link
            href="/signup"
            className="text-primary underline-offset-4 hover:underline"
          >
            Créer une organisation
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
