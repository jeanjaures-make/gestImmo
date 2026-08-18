import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, MailCheck, PencilLine, ShieldCheck } from "lucide-react";

import { AuthForm, EmailField, PasswordField } from "@/components/auth-form";
import { Card, CardContent } from "@/components/ui/kit";
import { signupMode, signupNeedsAttention } from "@/lib/auth-config";
import { formatCurrency } from "@/lib/money";
import { safePlanSlug } from "@/lib/plan-choice";
import { getActivePlans } from "@/lib/subscriptions";
import { signUp } from "../login/actions";

export const metadata = { title: "Créer votre compte — CaisseOps" };

/**
 * Inscription, une fois l'offre choisie.
 *
 * ─── Pourquoi l'offre d'abord ───────────────────────────────────────────
 * Arriver ici sans avoir choisi renvoie vers `/offres`. L'ordre inverse —
 * créer un compte, nommer son entreprise, puis découvrir le tarif —
 * demande tout l'effort avant d'annoncer le prix. Mieux vaut poser la
 * question qui engage pendant qu'elle ne coûte encore rien.
 *
 * Le slug reçu ne sert qu'à afficher et à suivre le fil. Le montant, lui,
 * sera relu dans `plans` au moment de créer le paiement : un `?plan=`
 * trafiqué ne peut désigner qu'une autre offre publique, jamais un tarif
 * inventé.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: raw } = await searchParams;
  const slug = safePlanSlug(raw);

  if (!slug) redirect("/offres");

  // Un slug inconnu — offre retirée de la vente, lien ancien — ramène au
  // choix plutôt que d'inscrire quelqu'un vers un plan qui n'existe plus.
  const chosen = (await getActivePlans()).find((p) => p.slug === slug);
  if (!chosen) redirect("/offres");

  const mode = signupMode();
  const misconfigured = signupNeedsAttention();

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">
          Créer votre compte
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Deux minutes. Vous nommerez votre entreprise à l&apos;étape
          suivante, et ne réglerez qu&apos;ensuite.
        </p>

        {/* L'offre retenue, rappelée et modifiable : on ne fait pas payer
            quelqu'un pour un choix qu'il ne voit plus. */}
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm">
            <span className="text-muted-foreground">Offre choisie : </span>
            <span className="font-medium">{chosen.name}</span>
            <span className="text-muted-foreground">
              {" "}
              — {formatCurrency(chosen.price)} / mois
            </span>
          </span>
          <Link
            href="/offres"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-primary underline underline-offset-4"
          >
            <PencilLine aria-hidden className="size-3.5" />
            Changer
          </Link>
        </div>

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
          <input type="hidden" name="plan" value={chosen.slug} />
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
