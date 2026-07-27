import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { MemberActions } from "@/components/member-actions";
import { RecordList, type RecordField } from "@/components/record-list";
import {
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  NativeSelect,
  PageHeader,
  StatusBadge,
} from "@/components/ui/kit";
import { canAdminister, requireSession } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  formatDate,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Profile,
} from "@/lib/types";
import { inviteMember } from "./actions";

export const metadata = { title: "Équipe — ImmoOps" };

export default async function TeamPage() {
  const { profile, organization, userId } = await requireSession();
  if (!canAdminister(profile.role)) redirect("/");

  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at")
    .returns<Profile[]>();

  const invitationsAvailable = isAdminConfigured();

  const nameOf = (m: Profile) =>
    `${m.firstname} ${m.lastname}`.trim() || m.email;

  const fields: RecordField<Profile>[] = [
    { label: "Membre", role: "title", value: nameOf },
    { label: "E-mail", role: "subtitle", value: (m) => m.email },
    {
      label: "Rôle",
      role: "badge",
      value: (m) => (
        <StatusBadge tone={m.role === "owner" ? "info" : "neutral"}>
          {ROLE_LABELS[m.role]}
        </StatusBadge>
      ),
    },
    { label: "Depuis", value: (m) => formatDate(m.created_at) },
  ];

  return (
    <>
      <PageHeader
        title="Équipe"
        description={`Les personnes ayant accès à « ${organization.name} ».`}
      />

      {!invitationsAvailable && (
        <Card className="mb-6 border-warning/40">
          <CardContent className="flex gap-4 p-5">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <h2 className="font-heading font-medium">
                Invitations indisponibles
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Inviter un collaborateur suppose de créer un compte
                d&apos;authentification pour quelqu&apos;un d&apos;autre. Seule
                la clé <span className="font-mono text-xs">service_role</span> le
                permet, et elle contourne le RLS — elle ne peut donc pas vivre
                dans le navigateur.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Ajoutez cette variable côté serveur pour activer les
                invitations, puis redémarrez :
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
                SUPABASE_SERVICE_ROLE_KEY=&lt;Project Settings → API → service_role&gt;
              </pre>
              <p className="mt-3 text-sm text-muted-foreground">
                Sans elle, le reste de cet écran fonctionne : vous pouvez
                consulter les membres, changer leur rôle et révoquer leur
                accès.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {invitationsAvailable && (
        <div className="mb-6">
          <EntityForm
            title="Inviter un collaborateur"
            triggerLabel="Inviter un collaborateur"
            submitLabel="Envoyer l'invitation"
            successMessage="Invitation envoyée."
            action={inviteMember}
          >
            <Field label="Adresse e-mail">
              <Input
                name="email"
                type="email"
                placeholder="collaborateur@exemple.com"
                required
              />
            </Field>
            <Field label="Prénom">
              <Input name="firstname" placeholder="Awa" />
            </Field>
            <Field label="Nom">
              <Input name="lastname" placeholder="Diallo" />
            </Field>
            <Field label="Rôle">
              <NativeSelect name="role" defaultValue="viewer">
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </EntityForm>
        </div>
      )}

      {error && (
        <EmptyState>
          Impossible de charger les membres : {error.message}
        </EmptyState>
      )}

      <div className="mb-6">
        <RecordList
          caption="Membres de l'organisation"
          items={members ?? []}
          keyOf={(m) => m.id}
          fields={fields}
          empty="Aucun membre à afficher."
          actions={(member) => (
            <MemberActions
              memberId={member.id}
              memberName={nameOf(member)}
              role={member.role}
              isSelf={member.id === userId}
            />
          )}
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-heading mb-4 font-medium">Ce que permet chaque rôle</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <div key={value}>
                <dt className="text-sm font-medium">{label}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">
                  {ROLE_DESCRIPTIONS[value as keyof typeof ROLE_DESCRIPTIONS]}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
