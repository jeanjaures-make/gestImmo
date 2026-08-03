import { AuthForm, PasswordField } from "@/components/auth-form";
import { Card, CardContent } from "@/components/ui/kit";
import { updatePassword } from "../login/actions";

export const metadata = { title: "Nouveau mot de passe — ImmoOps" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">
          Nouveau mot de passe
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Choisissez un mot de passe que vous n&apos;utilisez nulle part
          ailleurs.
        </p>

        <AuthForm action={updatePassword} submitLabel="Enregistrer">
          <PasswordField
            label="Nouveau mot de passe"
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
