"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type Json = Record<string, unknown> | null;

/** Colonnes techniques : sans intérêt pour un lecteur métier. */
const HIDDEN_FIELDS = new Set([
  "id",
  "organization_id",
  "created_at",
  "updated_at",
]);

function render(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AuditDiff({
  action,
  before,
  after,
  changedFields,
}: {
  action: string;
  before: Json;
  after: Json;
  changedFields: string[] | null;
}) {
  const [open, setOpen] = useState(false);

  // Sur un UPDATE, seul le delta compte. Sur INSERT/DELETE, on montre
  // l'état complet de la ligne, hors colonnes techniques.
  const fields =
    action === "UPDATE"
      ? (changedFields ?? []).filter((f) => !HIDDEN_FIELDS.has(f))
      : Object.keys(after ?? before ?? {}).filter((f) => !HIDDEN_FIELDS.has(f));

  if (!fields.length) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        {fields.length} champ{fields.length > 1 ? "s" : ""}
      </button>

      {open && (
        <dl className="mt-2 flex flex-col gap-2 border-l pl-3">
          {fields.map((field) => {
            const previous = before?.[field];
            const next = after?.[field];

            return (
              <div key={field} className="text-xs">
                <dt className="font-mono text-muted-foreground">{field}</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {action !== "INSERT" && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono",
                        action === "DELETE"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground line-through",
                      )}
                    >
                      {render(previous)}
                    </span>
                  )}
                  {action === "UPDATE" && (
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                  )}
                  {action !== "DELETE" && (
                    <span className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-success">
                      {render(next)}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
