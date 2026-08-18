"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/kit";

type Status =
  | "checking"
  | "pending"
  | "paid"
  | "active"
  | "failed"
  | "cancelled"
  | "expired"
  | "unknown";

/**
 * Sonde le paiement d'une inscription, puis réclame la session.
 *
 * ─── Ce que ce composant ne fait JAMAIS ─────────────────────────────────
 * Il n'accorde rien lui-même. Il ne fait qu'afficher ce que
 * `/api/signup/status` répond — lui-même une lecture pure de
 * `signup_intents.status`, écrit UNIQUEMENT par le webhook Moneroo après
 * vérification serveur. Un visiteur qui revient ici à la main, sans avoir
 * payé, ne verra jamais que « en attente » : ce composant ne peut ni
 * inventer un statut, ni court-circuiter la seule autorité d'activation.
 *
 * Une fois `status === "active"`, une VRAIE navigation (et non un appel
 * réseau) part vers `/api/signup/claim` : cette route pose les cookies de
 * session côté serveur puis redirige — un `fetch` ne le pourrait pas.
 */
export function SignupClaim({ intentRef }: { intentRef: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [claiming, setClaiming] = useState(false);
  const startedAt = useRef(Date.now());
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    /**
     * Espacement croissant plutôt qu'un rythme fixe.
     *
     * Une confirmation mobile-money n'est pas instantanée : le client doit
     * valider sur son téléphone, et cela peut demander plusieurs minutes.
     * Sonder toutes les 2,5 secondes pendant tout ce temps épuise la
     * limite de débit de la route — 24 requêtes par minute contre 60 par
     * tranche de cinq — et ce, à un seul client. Le rythme se relâche donc
     * à mesure que l'attente se prolonge.
     */
    function delay() {
      const waited = Date.now() - startedAt.current;
      if (waited < 30_000) return 2_500;
      if (waited < 120_000) return 5_000;
      return 10_000;
    }

    function again() {
      if (cancelled) return;
      if (Date.now() - startedAt.current > 60_000) setSlow(true);
      timer = setTimeout(poll, delay());
    }

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/signup/status?ref=${encodeURIComponent(intentRef)}`,
          { cache: "no-store" },
        );

        // Une réponse qui ne PORTE pas de statut n'en est pas un. Le cas
        // qui compte est le 429 : il rend `{ error }`, sans `status`. Le
        // lire comme « unknown » afficherait « cette inscription n'est
        // plus valable » et renverrait choisir une offre quelqu'un qui
        // vient de payer et dont l'inscription se porte très bien. Une
        // limite de débit atteinte est une raison d'attendre, jamais de
        // rendre un verdict.
        if (!res.ok) {
          again();
          return;
        }

        const data = (await res.json()) as { status?: Status };
        if (cancelled) return;

        const next = data.status;
        if (!next) {
          again();
          return;
        }

        setStatus(next);

        // Rien à faire de plus : le paiement est confirmé, le compte est
        // provisionné. On part réclamer la session.
        if (next === "active") {
          setClaiming(true);
          window.location.href = `/api/signup/claim?ref=${encodeURIComponent(intentRef)}`;
          return;
        }

        if (next === "pending" || next === "paid" || next === "checking") {
          again();
        }
      } catch {
        again();
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intentRef]);

  if (claiming || status === "active") {
    return (
      <State
        icon={<Loader2 className="size-6 animate-spin text-success" />}
        tone="success"
        title="Paiement confirmé"
        body="Ouverture de votre espace…"
      />
    );
  }

  if (status === "failed" || status === "cancelled") {
    return (
      <State
        icon={<AlertTriangle className="size-6 text-destructive" />}
        tone="destructive"
        title={
          status === "cancelled"
            ? "Le paiement n'a pas été finalisé"
            : "Le paiement a été refusé"
        }
        body="Aucun compte n'a été créé. Vous pouvez réessayer à tout moment."
        action={
          <Link href="/offres">
            <Button>Réessayer</Button>
          </Link>
        }
      />
    );
  }

  if (status === "expired" || status === "unknown") {
    return (
      <State
        icon={<AlertTriangle className="size-6 text-destructive" />}
        tone="destructive"
        title="Cette inscription n'est plus valable"
        body="Le lien a expiré ou est incorrect. Repartez du choix de votre offre."
        action={
          <Link href="/offres">
            <Button>Choisir une offre</Button>
          </Link>
        }
      />
    );
  }

  return (
    <State
      icon={<Loader2 className="size-6 animate-spin text-success" />}
      tone="success"
      title="Paiement reçu"
      body={
        slow
          ? "La vérification prend plus longtemps que d'habitude. Ne fermez pas cette page — elle se met à jour automatiquement dès la confirmation."
          : "Nous vérifions votre paiement auprès de Moneroo. Cela prend généralement moins d'une minute."
      }
    />
  );
}

function State({
  icon,
  tone,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  tone: "success" | "destructive";
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div
        className={
          tone === "success"
            ? "flex size-12 items-center justify-center rounded-full bg-success/10"
            : "flex size-12 items-center justify-center rounded-full bg-destructive/10"
        }
      >
        {icon}
      </div>
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action ? (
        <div className="mt-2">{action}</div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ne fermez pas cette page tant que la confirmation n&apos;est pas
          arrivée.
        </p>
      )}
    </div>
  );
}
