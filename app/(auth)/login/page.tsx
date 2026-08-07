import Link from "next/link";

import { AuthForm, EmailField, PasswordField } from "@/components/auth-form";
import { Card, CardContent } from "@/components/ui/kit";
import { safeNext } from "@/lib/redirect";
import { signIn } from "./actions";

export const metadata = { title: "Connexion — CaisseOps" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Le proxy pose `next` quand il intercepte une page protégée. On le
  // renvoie au formulaire après l'avoir borné à un chemin interne : sans
  // cette garde, `?next=https://site-pirate.fr` produirait une redirection
  // ouverte depuis une adresse de confiance.
  const destination = safeNext(next);

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">Connexion</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Accédez à votre espace de pilotage.
        </p>

        <AuthForm action={signIn} submitLabel="Se connecter">
          <input type="hidden" name="next" value={destination} />
          <EmailField autoFocus />
          <PasswordField
            hint={
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Oublié ?
              </Link>
            }
          />
        </AuthForm>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link
            href="/signup"
            className="text-primary underline underline-offset-4"
          >
            Créer une organisation
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
