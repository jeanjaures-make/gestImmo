"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui/kit";

export default function LicensePage() {
  const [key, setKey] = useState("");
  const [plan, setPlan] = useState("business");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function activate() {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/chariow/activate-license", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key, plan_id: plan }) });
      const data = await response.json();
      setMessage(response.ok ? "Licence activée. Votre accès est maintenant disponible." : (data.error ?? "Activation impossible."));
    } catch { setMessage("Impossible de contacter le serveur."); } finally { setLoading(false); }
  }
  return <div className="mx-auto max-w-lg"><Card><CardHeader><CardTitle>Activer ma licence</CardTitle></CardHeader><CardContent className="space-y-5">
    <div className="space-y-2"><Label htmlFor="license-key">Clé de licence</Label><Input id="license-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" /></div>
    <div className="space-y-2"><Label htmlFor="license-plan">Plan</Label><select id="license-plan" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="starter">Starter</option><option value="business">Business</option><option value="unlimited">Illimité</option></select></div>
    <Button onClick={activate} disabled={loading || key.trim().length < 4}>{loading ? "Activation…" : "Activer ma licence"}</Button>
    {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
  </CardContent></Card></div>;
}
