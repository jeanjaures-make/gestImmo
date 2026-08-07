import { AuthForm, PasswordField } from "@/components/auth-form";
import { Card, CardContent } from "@/components/ui/kit";
import { updatePassword } from "../login/actions";

export const metadata = { title: "Votre mot de passe — CaisseOps" };

/**
 * Un même écran, deux situations.
 *
 * Un collaborateur qui ouvre son espace pour la première fois n'a rien à
 * « réinitialiser » : lui parler de réinitialisation lui laisse croire
 * qu'il possédait déjà un compte et qu'il l'a perdu. Le paramètre
 * `bienvenue`, posé par le lien d'activation, change le propos sans
 * dupliquer le formulaire.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ bienvenue?: string }>;
}) {
  const { bienvenue } = await searchParams;
  const first = bienvenue === "1";

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">
          {first ? "Bienvenue" : "Nouveau mot de passe"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {first
            ? "Choisissez votre mot de passe pour accéder à votre espace. Il vous servira à vous connecter ensuite."
            : "Choisissez un mot de passe que vous n'utilisez nulle part ailleurs."}
        </p>

        <AuthForm
          action={updatePassword}
          submitLabel={first ? "Accéder à mon espace" : "Enregistrer"}
        >
          <PasswordField
            label={first ? "Votre mot de passe" : "Nouveau mot de passe"}
            autoComplete="new-password"
            showRules
          />
          <PasswordField
            name="confirm"
            label="Confirmation"
            autoComplete="new-password"
          />
        </AuthForm>
      </CardContent>
    </Card>
  );
}
