import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, Field, Input } from "@/components/ui/kit";
import { requestPasswordReset } from "../login/actions";

export const metadata = { title: "Mot de passe oublié — ImmoOps" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">
          Mot de passe oublié
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Nous vous enverrons un lien de réinitialisation.
        </p>

        <AuthForm action={requestPasswordReset} submitLabel="Envoyer le lien">
          <Field label="Adresse e-mail">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              required
            />
          </Field>
        </AuthForm>

        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Retour à la connexion
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
