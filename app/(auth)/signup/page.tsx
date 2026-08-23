import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, PencilLine, ShieldCheck } from "lucide-react";

import { AuthForm, EmailField } from "@/components/auth-form";
import { Card, CardContent, Field, Input } from "@/components/ui/kit";
import { formatCurrency } from "@/lib/money";
import { safePlanSlug } from "@/lib/plan-choice";
import { getActivePlans } from "@/lib/subscriptions";
import { startSignup } from "./actions";

export const metadata = { title: "Créer votre compte — CaisseOps" };

/**
 * Amorce d'inscription, une fois l'offre choisie.
 *
 * ─── Pourquoi pas de mot de passe ici ────────────────────────────────────
 * Ce formulaire ne crée aucun compte : il ouvre une INTENTION, puis un
 * paiement chez PayDunya. Le compte Supabase Auth ne naît qu'à la
 * confirmation du webhook — un événement serveur qui ne connaît rien du
 * navigateur qui a payé. Demander un mot de passe maintenant obligerait à
 * le conserver quelque part en attendant, ce que rien n'oblige à risquer.
 * Il se choisit APRÈS paiement, sur `/reset-password?bienvenue=1` — le
 * même écran que celui d'un collaborateur invité.
 *
 * ─── Pourquoi l'offre d'abord ────────────────────────────────────────────
 * Arriver ici sans avoir choisi renvoie vers `/offres`. Le slug reçu ne
 * sert qu'à afficher et à suivre le fil ; le montant, lui, est relu dans
 * `plans` par `startSignup`, jamais transmis par ce formulaire.
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
  // choix plutôt que d'amorcer une inscription vers un plan qui n'existe plus.
  const chosen = (await getActivePlans()).find((p) => p.slug === slug);
  if (!chosen) redirect("/offres");

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="font-heading mb-1 text-lg font-semibold">
          Créer votre compte
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Votre espace s&apos;ouvre dès que le paiement est confirmé. Vous
          choisirez votre mot de passe à ce moment-là.
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

        <AuthForm action={startSignup} submitLabel="Passer au paiement">
          <input type="hidden" name="plan" value={chosen.slug} />
          <EmailField autoFocus />
          <Field label="Nom de votre entreprise">
            <Input
              name="org_name"
              autoComplete="organization"
              required
              maxLength={120}
              placeholder="Awa Diallo Négoce"
              className="h-11"
            />
          </Field>
          <Field label="Téléphone">
            <Input
              name="phone"
              type="tel"
              autoComplete="tel-national"
              inputMode="tel"
              required
              maxLength={30}
              placeholder="0700000000"
              className="h-11"
            />
          </Field>
        </AuthForm>

        <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
          <CreditCard className="mt-0.5 size-3.5 shrink-0" />
          Vous serez redirigé vers Chariow pour régler {formatCurrency(chosen.price)}.
          Aucune donnée bancaire ne transite par CaisseOps.
        </p>

        <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Votre espace ne s&apos;active qu&apos;une fois le paiement confirmé
          par Chariow — jamais avant.
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
