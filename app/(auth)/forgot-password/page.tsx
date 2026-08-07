import Link from "next/link";

import { AuthForm, EmailField } from "@/components/auth-form";
import { Card, CardContent } from "@/components/ui/kit";
import { requestPasswordReset } from "../login/actions";

export const metadata = { title: "Mot de passe oublié — CaisseOps" };

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
          <EmailField autoFocus />
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
