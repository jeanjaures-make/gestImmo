import { redirect } from "next/navigation";
import { Search } from "lucide-react";

import { AuditDiff } from "@/components/audit-diff";
import { Pagination } from "@/components/pagination";
import { RecordList, type RecordField } from "@/components/record-list";
import {
  Button,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  StatusBadge,
  type Tone,
} from "@/components/ui/kit";
import { hasRole, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Journal d'audit — ImmoOps" };

type AuditRow = {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

const ENTITY_LABELS: Record<string, string> = {
  buildings: "Immeuble",
  apartments: "Logement",
  tenants: "Locataire",
  leases: "Bail",
  rent_payments: "Échéance",
  expenses: "Dépense",
  maintenance: "Intervention",
  documents: "Document",
};

const ACTION_LABELS: Record<AuditRow["action"], string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

const ACTION_TONES: Record<AuditRow["action"], Tone> = {
  INSERT: "success",
  UPDATE: "info",
  DELETE: "danger",
};

/** « Mozilla/5.0 (Windows NT 10.0…) Chrome/120… » → « Chrome · Windows ». */
function summarizeUserAgent(ua: string | null) {
  if (!ua) return "—";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Navigateur";

  const os =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : null;

  return os ? `${browser} · ${os}` : browser;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity?: string;
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { profile } = await requireSession();

  // Le RLS refuse déjà la lecture aux autres rôles ; cette redirection évite
  // d'afficher un écran vide et trompeur.
  if (!hasRole(profile.role, "owner", "manager")) redirect("/");

  const {
    entity = "",
    action = "",
    actor = "",
    from = "",
    to = "",
    page: pageParam,
  } = await searchParams;

  const page = readPage(pageParam);
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page.from, page.to);

  if (entity) query = query.eq("entity", entity);
  if (action) query = query.eq("action", action);
  if (actor) query = query.eq("actor_id", actor);
  if (from) query = query.gte("created_at", from);
  // `to` est une date seule : on borne à la fin de journée.
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const [{ data: entries, error, count }, { data: members }] = await Promise.all([
    query.returns<AuditRow[]>(),
    supabase
      .from("profiles")
      .select("id, firstname, lastname, email")
      .order("lastname")
      .returns<
        { id: string; firstname: string; lastname: string; email: string }[]
      >(),
  ]);

  const filtering = Boolean(entity || action || actor || from || to);
  const memberById = new Map(
    (members ?? []).map((m) => [
      m.id,
      `${m.firstname} ${m.lastname}`.trim() || m.email,
    ]),
  );

  const fields: RecordField<AuditRow>[] = [
    {
      label: "Utilisateur",
      role: "title",
      value: (e) =>
        (e.actor_id && memberById.get(e.actor_id)) ?? e.actor_email ?? "Système",
    },
    {
      label: "Date",
      role: "subtitle",
      value: (e) => new Date(e.created_at).toLocaleString("fr-FR"),
    },
    {
      label: "Action",
      role: "badge",
      value: (e) => (
        <StatusBadge tone={ACTION_TONES[e.action]}>
          {ACTION_LABELS[e.action]}
        </StatusBadge>
      ),
    },
    {
      label: "Ressource",
      value: (e) => ENTITY_LABELS[e.entity] ?? e.entity,
    },
    {
      label: "Origine",
      value: (e) => (
        <span className="text-xs">
          {e.ip ?? "—"} · {summarizeUserAgent(e.user_agent)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description="Qui a fait quoi, quand, depuis où. Alimenté par des triggers PostgreSQL — l'application ne peut pas le contourner."
      />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label
            htmlFor="audit-entity"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Ressource
          </label>
          <NativeSelect id="audit-entity" name="entity" defaultValue={entity}>
            <option value="">Toutes</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="w-40">
          <label
            htmlFor="audit-action"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Action
          </label>
          <NativeSelect id="audit-action" name="action" defaultValue={action}>
            <option value="">Toutes</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="w-52">
          <label
            htmlFor="audit-actor"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Utilisateur
          </label>
          <NativeSelect id="audit-actor" name="actor" defaultValue={actor}>
            <option value="">Tous</option>
            {(members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.firstname} ${m.lastname}`.trim() || m.email}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="w-40">
          <label
            htmlFor="audit-from"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Du
          </label>
          <Input id="audit-from" name="from" type="date" defaultValue={from} />
        </div>

        <div className="w-40">
          <label
            htmlFor="audit-to"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Au
          </label>
          <Input id="audit-to" name="to" type="date" defaultValue={to} />
        </div>

        <Button type="submit" size="lg" variant="outline">
          <Search className="size-4" />
          Filtrer
        </Button>
        {filtering && (
          <Button type="button" size="lg" variant="ghost" render={<a href="/audit" />}>
            Réinitialiser
          </Button>
        )}
      </form>

      {error && (
        <EmptyState>
          Impossible de charger le journal : {error.message}
        </EmptyState>
      )}

      {!error && (
        <RecordList
          caption="Journal d'audit"
          items={entries ?? []}
          keyOf={(e) => String(e.id)}
          fields={fields}
          detail={{
            label: "Modifications",
            className: "min-w-64",
            value: (e) => (
              <AuditDiff
                action={e.action}
                before={e.before_data}
                after={e.after_data}
                changedFields={e.changed_fields}
              />
            ),
          }}
          empty={
            filtering
              ? "Aucune entrée ne correspond à ces critères."
              : "Aucune action enregistrée pour le moment."
          }
        />
      )}

      {!error && (
        <Pagination
          page={page.number}
          size={page.size}
          total={count ?? 0}
          unit="entrées"
        />
      )}
    </>
  );
}
