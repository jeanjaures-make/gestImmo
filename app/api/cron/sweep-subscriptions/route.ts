import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Balayage quotidien des abonnements.
 *
 * Déclenché par Vercel Cron (voir `vercel.json`). Deux corrections :
 *
 *   — les abonnements dont la date est passée prennent le statut
 *     `expired`, au lieu de rester `active` avec une date échue ;
 *   — les tentatives de paiement restées en plan depuis plus de vingt-
 *     quatre heures sont abandonnées.
 *
 * Rien ici n'ouvre ni ne ferme de droits : l'accès se juge partout sur
 * `expires_at > NOW()`. Si ce balayage ne tournait jamais, le produit
 * fonctionnerait à l'identique — seule la table se lirait mal.
 *
 * L'appel est authentifié par `CRON_SECRET`, que Vercel transmet en
 * en-tête. Sans ce secret, la route reste inerte : elle est publique du
 * point de vue du proxy, comme le webhook.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Sans secret configuré, la route refuse de s'exécuter plutôt que de
  // s'ouvrir à tous : une variable oubliée ne doit pas devenir une porte.
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Clé de service non configurée." },
      { status: 503 },
    );
  }

  const { data, error } = await admin
    .rpc("sweep_subscriptions")
    .maybeSingle<{ expired: number; abandoned: number }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    expired: data?.expired ?? 0,
    abandoned: data?.abandoned ?? 0,
  });
}
