import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { getPlanById } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChariowPaymentProvider } from "@/lib/payments/chariow";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session === "no-profile") return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const limit = await rateLimit({ key: await callerKey("license-activate"), limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  let body: { license_key?: unknown; plan_id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  if (typeof body.license_key !== "string" || typeof body.plan_id !== "string") return NextResponse.json({ error: "Licence et plan requis." }, { status: 400 });
  let plan = await getPlanById(body.plan_id);
  if (!plan) {
    const lookup = await createClient();
    const { data } = await lookup.from("plans").select("*").eq("slug", body.plan_id).eq("is_active", true).maybeSingle();
    plan = data as typeof plan;
  }
  if (!plan) return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  const provider = new ChariowPaymentProvider();
  try {
    const license = await provider.getLicense(body.license_key.trim());
    const productId = String(license.product_id ?? (license.product as { id?: unknown } | undefined)?.id ?? "");
    const expected = process.env[`CHARIOW_PRODUCT_${plan.slug.toUpperCase()}`];
    if (!expected || productId !== expected.trim()) return NextResponse.json({ error: "Cette licence ne correspond pas au plan choisi." }, { status: 409 });
    if (license.is_expired === true || license.status === "expired" || license.status === "revoked") return NextResponse.json({ error: "Cette licence a expiré ou a été révoquée." }, { status: 409 });
    if (license.can_activate === false) return NextResponse.json({ error: "La limite d'activations de cette licence a été atteinte." }, { status: 409 });
    const activated = license.status === "active" && license.requires_activation === false ? license : await provider.activateLicense(body.license_key.trim(), `saas:${session.userId}`);
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
    const { error } = await admin.from("licenses").upsert({ organization_id: session.organization.id, user_id: session.userId, chariow_license_id: String(license.id ?? ""), chariow_product_id: productId, license_key: body.license_key.trim(), plan_id: plan.id, status: String(activated.status ?? "active"), activated_at: activated.activated_at ?? new Date().toISOString(), expires_at: activated.expires_at ?? license.expires_at ?? null }, { onConflict: "organization_id,license_key" });
    if (error) return NextResponse.json({ error: "Impossible d'enregistrer la licence." }, { status: 500 });
    return NextResponse.json({ activated: true, plan: plan.slug, expires_at: activated.expires_at ?? license.expires_at ?? null });
  } catch { return NextResponse.json({ error: "Impossible d'activer la licence pour le moment." }, { status: 502 }); }
}
