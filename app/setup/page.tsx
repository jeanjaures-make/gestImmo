import { AlertTriangle, Building2, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/kit";
import { runDiagnostics, type CheckStatus } from "@/lib/diagnostics";

export const metadata = { title: "Configuration — ImmoOps" };

// Toujours recalculé : l'intérêt de cette page est de refléter l'état courant.
export const dynamic = "force-dynamic";

const ICONS: Record<CheckStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

const COLORS: Record<CheckStatus, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
};

export default async function SetupPage() {
  const checks = await runDiagnostics();
  const allGood = checks.every((c) => c.status === "ok");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-6" />
          </span>
          <h1 className="font-heading text-xl font-semibold">
            Configuration d&apos;ImmoOps
          </h1>
          <p className="text-sm text-muted-foreground">
            {allGood
              ? "Tout est en place. Vous pouvez vous connecter."
              : "Quelques étapes avant de démarrer."}
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-0">
            <ul className="divide-y">
              {checks.map((check) => {
                const Icon = ICONS[check.status];
                return (
                  <li key={check.label} className="flex gap-3 p-4">
                    <Icon
                      className={`mt-0.5 size-4 shrink-0 ${COLORS[check.status]}`}
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium">
                        {check.label}
                      </p>
                      <p className="mt-1 text-sm break-words text-muted-foreground">
                        {check.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="font-heading mb-4 font-medium">Marche à suivre</h2>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
              <li>
                Créez un projet sur{" "}
                <a
                  className="text-primary underline underline-offset-4"
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                >
                  supabase.com/dashboard
                </a>
                .
              </li>
              <li>
                Dans <span className="font-mono text-xs">SQL Editor</span>,
                exécutez{" "}
                <span className="font-mono text-xs">supabase/schema.sql</span>.
                Si vous aviez déjà appliqué le schéma V1 (modèle{" "}
                <span className="font-mono text-xs">owner_id</span>), lancez
                d&apos;abord{" "}
                <span className="font-mono text-xs">supabase/reset.sql</span>.
              </li>
              <li>
                Copiez l&apos;URL du projet et la clé{" "}
                <span className="font-mono text-xs">anon</span> depuis{" "}
                <span className="font-mono text-xs">
                  Project Settings → API
                </span>{" "}
                dans{" "}
                <span className="font-mono text-xs">.env.local</span>. L&apos;URL
                ressemble à{" "}
                <span className="font-mono text-xs">
                  https://abcd1234.supabase.co
                </span>
                .
              </li>
              <li>
                Relancez{" "}
                <span className="font-mono text-xs">npm run dev</span> : les
                variables d&apos;environnement ne sont lues qu&apos;au
                démarrage.
              </li>
            </ol>

            {allGood && (
              <a
                href="/login"
                className="mt-6 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                Aller à la connexion
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
