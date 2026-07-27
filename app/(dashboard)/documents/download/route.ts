import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { createSignedDownloadUrl } from "@/lib/documents";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Redirige vers une URL signée à durée de vie courte.
 *
 * Le bucket est privé : rien n'est servi directement. Le chemin est vérifié
 * côté application (préfixe = organisation) *et* côté PostgreSQL par la
 * policy RLS de storage.objects — deux barrières indépendantes.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session === "no-profile") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const limit = await rateLimit({
    key: `download:${session.userId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de téléchargements." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Chemin manquant." }, { status: 400 });
  }

  if (!path.startsWith(`${session.organization.id}/`) || path.includes("..")) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { url, error } = await createSignedDownloadUrl(path);
  if (!url) {
    return NextResponse.json(
      { error: error ?? "Document introuvable." },
      { status: 404 },
    );
  }

  return NextResponse.redirect(url);
}
