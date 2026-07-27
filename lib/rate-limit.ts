import "server-only";

import { createClient } from "@/lib/supabase/server";

export type RateLimitVerdict = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };

/** Ligne renvoyée par la fonction SQL `consume_rate_limit`. */
type Row = { allowed: boolean; remaining: number; retry_after_seconds: number };

/**
 * Repli local, utilisé uniquement si le compteur partagé est injoignable.
 * Trop permissif sur plusieurs instances, mais bien préférable à l'absence
 * totale de limite : un incident de base ne doit pas ouvrir la porte.
 */
const buckets = new Map<string, Bucket>();

function rateLimitInMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitVerdict {
  const now = Date.now();

  // Purge opportuniste : évite que la Map grossisse indéfiniment.
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Limiteur de débit à fenêtre fixe, partagé par toutes les instances.
 *
 * Le compteur vit dans PostgreSQL (`consume_rate_limit`), incrémenté par un
 * `INSERT … ON CONFLICT DO UPDATE` : l'opération est atomique, deux requêtes
 * concurrentes ne peuvent pas lire la même valeur. C'est ce qui rend la
 * limite exacte sur Vercel, où chaque requête peut atterrir sur une
 * instance différente — un compteur en mémoire y valait N fois la limite
 * demandée.
 */
export async function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitVerdict> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });

    // `RETURNS TABLE` d'une seule ligne : PostgREST peut livrer le tableau
    // ou l'objet seul selon la négociation de contenu. Les deux formes sont
    // acceptées plutôt que de parier sur l'une d'elles.
    const rows = data as Row | Row[] | null;
    const verdict = Array.isArray(rows) ? rows[0] : rows;

    if (error || !verdict) return rateLimitInMemory(key, limit, windowMs);

    return {
      ok: verdict.allowed,
      remaining: verdict.remaining,
      retryAfterSeconds: verdict.retry_after_seconds,
    };
  } catch {
    // Base injoignable ou schéma pas encore appliqué : on limite quand même.
    return rateLimitInMemory(key, limit, windowMs);
  }
}

/** Identifiant d'appelant pour les routes non authentifiées. */
export async function callerKey(prefix: string) {
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return `${prefix}:${ip}`;
}
