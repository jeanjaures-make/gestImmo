import { NextResponse, type NextRequest } from "next/server";

import { callerKey, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Statut public d'une intention d'inscription — sondé par `/billing/success`
 * pendant que le webhook Chariow confirme le paiement en arrière-plan.
 *
 * Ne rend qu'un mot : ni l'e-mail, ni le nom de l'entreprise, ni aucun
 * identifiant utilisable. La personne qui interroge cette route n'a pas de
 * session — `ref` (l'identifiant de l'intention) est la seule chose qui la
 * relie à sa propre inscription, et il ne doit rien apprendre de plus.
 *
 * `signup_intent_status()` est SECURITY DEFINER, appelée avec le client
 * d'administration : une intention n'a aucune policy de lecture, exactement
 * comme `payment_events`.
 */
export async function GET(request: NextRequest) {
  // La clé est l'adresse IP, et plusieurs clients la partagent souvent :
  // un bureau derrière un routeur, un opérateur mobile qui agrège ses
  // abonnés. Serrer ici ne protège pas grand-chose — la lecture est un
  // accès par clé primaire qui rend un mot — mais ferait patienter en
  // vain des gens qui ont payé, et pire, les uns à cause des autres. Le
  // sondage s'espace de lui-même à mesure que l'attente se prolonge
  // (voir `components/signup-claim.tsx`) : la marge sert les attentes
  // longues et simultanées, pas un martèlement.
  const limit = await rateLimit({
    key: await callerKey("signup-status"),
    limit: 300,
    windowMs: 10 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  }

  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref || !/^[0-9a-f-]{36}$/i.test(ref)) {
    return NextResponse.json({ status: "unknown" });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  }

  const { data, error } = await admin.rpc("signup_intent_status", {
    p_intent_id: ref,
  });

  if (error || !data) {
    return NextResponse.json({ status: "unknown" });
  }

  return NextResponse.json({ status: data as string });
}
