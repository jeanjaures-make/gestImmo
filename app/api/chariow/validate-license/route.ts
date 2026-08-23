import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { ChariowPaymentProvider } from "@/lib/payments/chariow";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session === "no-profile") return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const limit = await rateLimit({ key: await callerKey("license-validate"), limit: 10, windowMs: 10 * 60_000 });
  if (!limit.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  let body: { license_key?: unknown; plan_id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  if (typeof body.license_key !== "string" || body.license_key.trim().length < 4) return NextResponse.json({ error: "Clé de licence requise." }, { status: 400 });
  try {
    const data = await new ChariowPaymentProvider().getLicense(body.license_key.trim());
    const active = data.is_active === true || data.status === "active";
    const expired = data.is_expired === true || (typeof data.expires_at === "string" && new Date(data.expires_at) <= new Date());
    if (!active || expired || data.status === "revoked") return NextResponse.json({ valid: false, error: expired ? "Cette licence a expiré." : "Cette clé de licence est invalide." });
    return NextResponse.json({ valid: true, product_id: data.product_id ?? (data.product as { id?: unknown } | undefined)?.id, can_activate: data.can_activate !== false, status: data.status ?? "active", expires_at: data.expires_at ?? null });
  } catch { return NextResponse.json({ valid: false, error: "Impossible de vérifier la licence pour le moment." }, { status: 502 }); }
}
