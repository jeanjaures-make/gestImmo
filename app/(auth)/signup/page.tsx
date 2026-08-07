import Link from "next/link";
import { AlertTriangle, MailCheck, ShieldCheck } from "lucide-react";

import { AuthForm, EmailField, PasswordField } from "@/components/auth-form";
import { Card, CardContent } from "@/components/ui/kit";
import { signupMode, signupNeedsAttention } from "@/lib/auth-config";
import { signUp } from "../login/actions";

export const metadata = { title: "Créer une organisation — CaisseOps" };

export default function SignUpPage() {
  const mode = signupMode();
  const misconfigured = signupNeedsAttention();

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">
          Créer votre organisation
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Deux minutes, sans carte bancaire. Vous nommerez votre organisation
          à l&apos;étape suivante.
        </p>

        {misconfigured && (
          // Défaut d'exploitation, pas d'usage : la clé d'administration
          // manque alors que la confirmation par e-mail n'est pas demandée.
          // Le dire ici évite qu'un visiteur bute sur un message technique.
          <p className="mb-5 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            L&apos;inscription est momentanément indisponible. Écrivez-nous à
            contact@caisseops.com, nous ouvrons votre accès.
          </p>
        )}

        <AuthForm action={signUp} submitLabel="Créer mon compte">
          <EmailField autoFocus />
          <PasswordField autoComplete="new-password" showRules />
        </AuthForm>

        <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
          {mode === "instant" ? (
            <>
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Votre espace s&apos;ouvre immédiatement : aucun e-mail de
              confirmation à attendre.
            </>
          ) : (
            <>
              <MailCheck className="mt-0.5 size-3.5 shrink-0" />
              Un lien de confirmation vous sera envoyé pour activer votre
              compte.
            </>
          )}
        </p>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-primary underline underline-offset-4"
          >
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
