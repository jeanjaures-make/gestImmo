import Image from "next/image";
import { Monitor, ShieldCheck } from "lucide-react";

import { SettingsForm } from "@/components/settings-form";
import { SignOutEverywhere } from "@/components/sign-out-everywhere";
import {
  Card,
  CardContent,
  Field,
  Input,
  PageHeader,
  StatusBadge,
} from "@/components/ui/kit";
import { canAdminister, requireSession } from "@/lib/auth";
import { LOGO_TYPES } from "@/lib/logo";
import { NOTIFICATION_PREFERENCES } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { formatRelative, ROLE_LABELS } from "@/lib/types";
import {
  changePassword,
  updateNotificationPreferences,
  updateOrganization,
  updateProfile,
} from "./actions";

export const metadata = { title: "Réglages — ImmoOps" };

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

  // La colonne peut manquer si le schéma n'a pas encore été rejoué : on
  // retombe alors sur « rien de coupé », plutôt que sur un écran en erreur.
  const muted = (profile as { muted_notifications?: string[] })
    .muted_notifications ?? [];

  return (
    <>
      <PageHeader
        title="Réglages"
        description="Votre compte, votre sécurité et votre organisation."
      />

      <div className="flex max-w-3xl flex-col gap-6">
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

        {/* --------------------------------------------------- Préférences */}
        <SettingsForm
          title="Ce dont vous voulez être averti"
          description="Les notifications décochées cessent d'apparaître et de compter dans la pastille. Rien n'est perdu : les réactiver fait réapparaître l'historique."
          submitLabel="Enregistrer"
          successMessage="Préférences enregistrées."
          action={updateNotificationPreferences}
        >
          {NOTIFICATION_PREFERENCES.map(({ kind, label, hint }) => (
            <label
              key={kind}
              className="flex min-h-11 items-start gap-3 sm:col-span-2"
            >
              <input
                type="checkbox"
                name="kinds"
                value={kind}
                defaultChecked={!muted.includes(kind)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {hint}
                </span>
              </span>
            </label>
          ))}
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

        {/* --------------------------------------------------- Organisation */}
        {isOwner ? (
          <SettingsForm
            title="Votre organisation"
            description="Le nom et le logo apparaissent dans le bandeau latéral et sur les quittances remises à vos locataires."
            submitLabel="Enregistrer"
            successMessage="Organisation mise à jour."
            action={updateOrganization}
          >
            <Field label="Nom de l'organisation">
              <Input
                name="name"
                defaultValue={organization.name}
                required
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
        ) : (
          <Card>
            <CardContent className="flex gap-4 p-5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="font-heading font-medium">
                  Votre organisation
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vous appartenez à « {organization.name} » en tant que{" "}
                  {ROLE_LABELS[profile.role].toLowerCase()}. Le nom et le logo
                  ne sont modifiables que par un propriétaire.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
