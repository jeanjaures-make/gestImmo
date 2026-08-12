import Image from "next/image";
import { Monitor, ShieldCheck } from "lucide-react";

import { SettingsForm } from "@/components/settings-form";
import { SignOutEverywhere } from "@/components/sign-out-everywhere";
import { LetterheadPreview } from "@/components/letterhead";
import {
  Card,
  CardContent,
  Field,
  Input,
  PageHeader,
  StatusBadge,
  Textarea,
} from "@/components/ui/kit";
import { canAdminister, requireSession } from "@/lib/auth";
import { LOGO_TYPES } from "@/lib/logo";
import { createClient } from "@/lib/supabase/server";
import { formatRelative, ROLE_LABELS } from "@/lib/types";
import { changePassword, updateOrganization, updateProfile } from "./actions";

export const metadata = { title: "Réglages — CaisseOps" };

/** Ce que l'appareil dit de lui-même, ramené à quelque chose de lisible. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Appareil inconnu";

  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Système inconnu";

  // L'ordre compte : Edge et Chrome se déclarent tous deux « Chrome ».
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Navigateur inconnu";

  return `${browser} sur ${system}`;
}

type LoginEvent = {
  id: number;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

const RECENT_LOGINS = 10;

export default async function SettingsPage() {
  const { profile, organization, email, userId } = await requireSession();
  const isOwner = canAdminister(profile.role);

  const supabase = await createClient();

  // `count: "exact"` : on affiche le total, pas seulement la tranche visible.
  const { data: logins, count: loginCount } = await supabase
    .from("login_events")
    .select("id, success, ip, user_agent, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_LOGINS)
    .returns<LoginEvent[]>();

  const total = loginCount ?? 0;
  const shown = logins?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Réglages"
        description="Votre compte, votre sécurité et l'en-tête de vos pièces."
      />

      <div className="flex max-w-3xl flex-col gap-6">
        {/* --------------------------------------------------- En-tête */}
        {isOwner ? (
          <>
            <SettingsForm
              title="En-tête de vos pièces"
              description="Ce bloc s'imprime en haut de chaque reçu, bon de caisse et bon de sortie. Tout est facultatif sauf le nom : complétez au fil de l'eau, vos pièces restent émettables entre-temps."
              submitLabel="Enregistrer l'en-tête"
              successMessage="En-tête mis à jour."
              action={updateOrganization}
            >
              <Field label="Raison sociale">
                <Input
                  name="name"
                  defaultValue={organization.name}
                  placeholder="Nom de votre entreprise"
                  required
                  maxLength={120}
                />
              </Field>
              <Field label="Forme juridique" hint="S.A.R.L., S.A., E.I…">
                <Input
                  name="legal_form"
                  defaultValue={organization.legal_form ?? ""}
                  placeholder="S.A.R.L."
                  maxLength={40}
                />
              </Field>
              {/* L'indice ne reprend pas le libellé du champ voisin : le
                  nom accessible d'un champ inclut son indice, et « la
                  ligne sous la raison sociale » rendait deux champs
                  indiscernables — pour un lecteur d'écran comme pour un
                  test. On décrit la place, pas le champ d'à côté. */}
              <Field
                label="Sous-titre"
                hint="S'imprime juste sous le nom, en plus petit."
              >
                <Input
                  name="trade_name"
                  defaultValue={organization.trade_name ?? ""}
                  placeholder="Ce que fait votre entreprise, en une ligne"
                  maxLength={160}
                />
              </Field>
              <Field label="Accroche" hint="Votre signature commerciale.">
                <Input
                  name="tagline"
                  defaultValue={organization.tagline ?? ""}
                  placeholder="Votre devise, si vous en avez une"
                  maxLength={160}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field
                  label="Domaines d'activité"
                  hint="Une activité par ligne, douze au maximum. Elles s'impriment en puces à droite du logo."
                >
                  <Textarea
                    name="activities"
                    rows={4}
                    defaultValue={organization.activities.join("\n")}
                    placeholder={
                      "Première activité\nDeuxième activité\nTroisième activité"
                    }
                  />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label="Adresse">
                  <Input
                    name="address"
                    defaultValue={organization.address ?? ""}
                    placeholder="Quartier, rue, repère"
                    maxLength={240}
                  />
                </Field>
              </div>

              <Field label="Téléphone">
                <Input
                  name="phone"
                  defaultValue={organization.phone ?? ""}
                  placeholder="(+225) 00 00 00 00 00"
                  maxLength={60}
                />
              </Field>
              <Field label="Téléphone secondaire">
                <Input
                  name="phone_alt"
                  defaultValue={organization.phone_alt ?? ""}
                  placeholder="(+225) 00 00 00 00 00"
                  maxLength={60}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  name="email"
                  type="email"
                  defaultValue={organization.email ?? ""}
                  placeholder="contact@exemple.com"
                  maxLength={120}
                />
              </Field>
              <Field label="E-mail secondaire">
                <Input
                  name="email_alt"
                  type="email"
                  defaultValue={organization.email_alt ?? ""}
                  maxLength={120}
                />
              </Field>
              <Field label="Site web">
                <Input
                  name="website"
                  defaultValue={organization.website ?? ""}
                  placeholder="www.exemple.com"
                  maxLength={120}
                />
              </Field>

              <Field
                label="Logo"
                hint="PNG, JPEG, WebP ou SVG, 1 Mo maximum. Laissez vide pour conserver le logo actuel."
              >
                <div className="flex items-center gap-3">
                  {organization.logo_url && (
                    <Image
                      src={organization.logo_url}
                      alt={`Logo actuel de ${organization.name}`}
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded-lg border object-contain"
                    />
                  )}
                  <Input
                    name="logo"
                    type="file"
                    accept={LOGO_TYPES.join(",")}
                    className="h-auto py-1.5"
                  />
                </div>
              </Field>
            </SettingsForm>

            {/* Voir le résultat sans avoir à émettre une pièce pour
                vérifier : c'est ici qu'on ajuste, pas sur un reçu réel. */}
            <Card>
              <CardContent className="p-5">
                <h2 className="font-heading font-medium">
                  Aperçu de l&apos;en-tête
                </h2>
                <p className="mt-1 mb-4 text-sm text-muted-foreground">
                  Tel qu&apos;il s&apos;imprimera, une fois vos modifications
                  enregistrées.
                </p>
                <div
                  className="overflow-x-auto rounded-lg border bg-white p-4"
                  tabIndex={0}
                  role="region"
                  aria-label="Aperçu de l'en-tête imprimé"
                >
                  <LetterheadPreview organization={organization} />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="flex gap-4 p-5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="font-heading font-medium">
                  En-tête de vos pièces
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vous appartenez à « {organization.name} » en tant que{" "}
                  {ROLE_LABELS[profile.role].toLowerCase()}. L&apos;en-tête
                  imprimé n&apos;est modifiable que par un propriétaire.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------- Profil */}
        <SettingsForm
          title="Votre profil"
          description={`Vous êtes connecté avec ${email}, votre identifiant de connexion.`}
          submitLabel="Enregistrer"
          successMessage="Profil mis à jour."
          action={updateProfile}
        >
          <Field label="Prénom">
            <Input
              name="firstname"
              defaultValue={profile.firstname}
              placeholder="Awa"
              autoComplete="given-name"
            />
          </Field>
          <Field label="Nom">
            <Input
              name="lastname"
              defaultValue={profile.lastname}
              placeholder="Diallo"
              autoComplete="family-name"
            />
          </Field>
        </SettingsForm>

        {/* -------------------------------------------------- Mot de passe */}
        <SettingsForm
          title="Votre mot de passe"
          description="Douze caractères au minimum, avec majuscule, minuscule et chiffre. Votre mot de passe actuel vous est redemandé : sans cela, une session laissée ouverte suffirait à vous en priver."
          submitLabel="Changer le mot de passe"
          successMessage="Mot de passe changé."
          action={changePassword}
          resetOnSuccess
        >
          <Field label="Mot de passe actuel">
            <Input
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <div className="hidden sm:block" aria-hidden />
          <Field label="Nouveau mot de passe">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Confirmation">
            <Input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>
        </SettingsForm>

        {/* ----------------------------------------------------- Connexions */}
        <Card>
          <CardContent className="p-5">
            <h2 className="font-heading font-medium">Connexions récentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {total === 0
                ? "Aucune connexion enregistrée pour l'instant."
                : shown < total
                  ? `Les ${shown} dernières, sur ${total} enregistrées. Une tentative refusée que vous ne reconnaissez pas mérite un changement de mot de passe.`
                  : `${total} enregistrée${total > 1 ? "s" : ""}. Une tentative refusée que vous ne reconnaissez pas mérite un changement de mot de passe.`}
            </p>

            {shown > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {logins!.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <Monitor className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {describeDevice(event.user_agent)}
                    </span>
                    <StatusBadge tone={event.success ? "success" : "danger"}>
                      {event.success ? "Réussie" : "Refusée"}
                    </StatusBadge>
                    <span className="text-sm text-muted-foreground">
                      {formatRelative(event.created_at)}
                    </span>
                    {event.ip && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {event.ip}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5">
              <SignOutEverywhere />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
