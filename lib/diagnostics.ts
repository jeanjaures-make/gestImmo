import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type CheckStatus = "ok" | "warn" | "error";

export type Check = {
  label: string;
  status: CheckStatus;
  detail: string;
};

function checkUrl(raw: string | undefined): Check {
  if (!raw) {
    return {
      label: "NEXT_PUBLIC_SUPABASE_URL",
      status: "error",
      detail: "Variable absente de .env.local.",
    };
  }

  // Erreur de copier-coller fréquente : on colle une clé dans le champ URL.
  if (raw.startsWith("sb_") || raw.startsWith("eyJ")) {
    return {
      label: "NEXT_PUBLIC_SUPABASE_URL",
      status: "error",
      detail:
        "Cette valeur est une clé, pas une URL. Attendu : https://<ref>.supabase.co",
    };
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      return {
        label: "NEXT_PUBLIC_SUPABASE_URL",
        status: "error",
        detail: "L'URL doit être en https.",
      };
    }
    return {
      label: "NEXT_PUBLIC_SUPABASE_URL",
      status: "ok",
      detail: url.origin,
    };
  } catch {
    return {
      label: "NEXT_PUBLIC_SUPABASE_URL",
      status: "error",
      detail: "Valeur illisible : ce n'est pas une URL.",
    };
  }
}

function checkKey(raw: string | undefined): Check {
  if (!raw) {
    return {
      label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: "error",
      detail: "Variable absente de .env.local.",
    };
  }

  const isJwt = raw.split(".").length === 3;
  const isPublishable = raw.startsWith("sb_publishable_");

  if (!isJwt && !isPublishable) {
    return {
      label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: "error",
      detail: "Format inattendu pour une clé anon / publishable.",
    };
  }

  if (raw.includes("service_role")) {
    return {
      label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: "error",
      detail:
        "C'est une clé service_role : elle contourne le RLS et ne doit JAMAIS être exposée au navigateur.",
    };
  }

  return {
    label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    status: "ok",
    detail: `Clé ${isJwt ? "JWT" : "publishable"} détectée.`,
  };
}

/**
 * Détecte un schéma d'une version antérieure.
 *
 * `organizations` existe depuis la première version : sa présence ne dit
 * rien des ajouts ultérieurs. On sonde donc les tables les plus récentes.
 * Sans elles l'application fonctionne — les requêtes concernées renvoient
 * simplement du vide — mais notifications et déclarations de paiement
 * restent silencieusement inertes, ce qui est pire qu'une panne franche.
 */
async function checkSchemaVersion(url: string, key: string): Promise<Check> {
  const probe = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const recent = ["notifications", "payment_declarations", "rate_limits"];

  const missing: string[] = [];
  for (const table of recent) {
    const { error } = await probe.from(table).select("*").limit(0);
    // 42501 / RLS : la table existe, elle est seulement protégée — et
    // c'est exactement ce qu'on attend d'un appel anonyme.
    if (
      error?.code === "42P01" ||
      error?.message.toLowerCase().includes("could not find the table")
    ) {
      missing.push(table);
    }
  }

  if (!missing.length) {
    return {
      label: "Version du schéma",
      status: "ok",
      detail: "À jour.",
    };
  }

  return {
    label: "Version du schéma",
    status: "warn",
    detail: `Schéma antérieur détecté (${missing.join(", ")} absente(s)). Ré-exécutez supabase/schema.sql : il est rejouable et ne détruit aucune donnée.`,
  };
}

/**
 * Diagnostic complet, sans jamais lever d'exception : l'écran de setup doit
 * s'afficher quel que soit l'état de la configuration.
 */
export async function runDiagnostics(): Promise<Check[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  const urlCheck = checkUrl(url);
  const keyCheck = checkKey(key);
  const checks = [urlCheck, keyCheck];

  if (urlCheck.status !== "ok" || keyCheck.status !== "ok") {
    checks.push({
      label: "Connexion à Supabase",
      status: "warn",
      detail: "Non testée : corrigez d'abord les variables ci-dessus.",
    });
    return checks;
  }

  // Client anonyme sans cookies : on teste la joignabilité, pas la session.
  try {
    const probe = createSupabaseClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Surtout pas `head: true` : PostgREST répond alors sans corps, et
    // supabase-js ne remonte pas l'erreur 404 d'une table manquante — le
    // diagnostic conclurait à tort que le schéma est en place.
    const { error } = await probe.from("organizations").select("id").limit(1);

    if (!error) {
      checks.push({
        label: "Connexion à Supabase",
        status: "ok",
        detail: "Projet joignable et schéma en place.",
      });
      checks.push(await checkSchemaVersion(url!, key!));
    } else if (
      error.code === "42P01" ||
      error.code?.startsWith("PGRST20") ||
      error.message.toLowerCase().includes("does not exist") ||
      error.message.toLowerCase().includes("could not find the table")
    ) {
      checks.push({
        label: "Schéma de base de données",
        status: "error",
        detail:
          "Projet joignable, mais la table `organizations` est absente. Exécutez supabase/schema.sql.",
      });
    } else {
      checks.push({
        label: "Connexion à Supabase",
        status: "error",
        detail: `${error.code ?? "erreur"} — ${error.message}`,
      });
    }
  } catch (cause) {
    checks.push({
      label: "Connexion à Supabase",
      status: "error",
      detail:
        cause instanceof Error ? cause.message : "Projet Supabase injoignable.",
    });
  }

  return checks;
}
