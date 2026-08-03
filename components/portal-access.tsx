"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  KeyRound,
  MessageCircle,
  RefreshCw,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, StatusBadge } from "@/components/ui/kit";
import {
  grantPortalAccess,
  regeneratePortalLink,
  revokePortalAccess,
  type PortalAccessState,
} from "@/app/(dashboard)/tenants/portal-access";

/**
 * Ouverture de l'espace locataire.
 *
 * Aucun e-mail ne part : l'application produit un lien d'activation, le
 * gestionnaire le transmet par le canal qui atteint vraiment son
 * locataire. Ce lien ouvre une session — il est donc affiché une fois,
 * jamais conservé, et régénérable s'il se perd.
 */
export function PortalAccess({
  tenantId,
  tenantName,
  email,
  hasAccess,
  available,
}: {
  tenantId: string;
  tenantName: string;
  email: string | null;
  hasAccess: boolean;
  available: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<PortalAccessState | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: typeof grantPortalAccess, onSuccess?: () => void) {
    const formData = new FormData();
    formData.set("tenant_id", tenantId);

    startTransition(async () => {
      const state = await action({}, formData);
      setConfirmOpen(false);
      if (state.error) {
        toast.error(state.error);
        return;
      }
      if (state.link) setResult(state);
      onSuccess?.();
    });
  }

  if (result?.link) {
    return (
      <LinkPanel
        state={result}
        onDone={() => setResult(null)}
        onRegenerate={() => run(regeneratePortalLink)}
        pending={pending}
      />
    );
  }

  // ------------------------------------------------- Accès déjà ouvert
  if (hasAccess) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusBadge tone="success">Accès ouvert</StatusBadge>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(regeneratePortalLink)}
          >
            <RefreshCw className="size-3.5" />
            Nouveau lien
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Fermer l'espace de ${tenantName}`}
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
          >
            <ShieldOff className="size-4" />
          </Button>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Fermer l&apos;espace de {tenantName} ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Son compte est supprimé et sa connexion cesse immédiatement.
                Sa fiche, ses baux et ses échéances sont conservés — vous
                pourrez lui rouvrir un accès plus tard.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  run(revokePortalAccess, () =>
                    toast.success(`L'espace de ${tenantName} est fermé.`),
                  )
                }
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Fermer l&apos;accès
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Deux empêchements distincts, deux messages : « indisponible » sans
  // dire pourquoi ferait chercher au mauvais endroit.
  if (!available) {
    return (
      <span className="text-xs text-muted-foreground">
        Clé service_role requise
      </span>
    );
  }

  if (!email) {
    return (
      <span className="text-xs text-muted-foreground">E-mail manquant</span>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          <KeyRound className="size-3.5" />
          Ouvrir l&apos;accès
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ouvrir l&apos;espace locataire ?</AlertDialogTitle>
            <AlertDialogDescription>
              Aucun e-mail ne sera envoyé. Vous recevrez un lien d&apos;activation
              à transmettre à {tenantName} par le moyen de votre choix — WhatsApp,
              SMS ou de vive voix. Il y choisira son mot de passe, puis accédera
              à son bail, ses quittances et ses interventions, et à rien d&apos;autre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(grantPortalAccess)}>
              {pending ? "Ouverture…" : "Générer le lien"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Le lien, affiché une seule fois, avec de quoi le transmettre. */
function LinkPanel({
  state,
  onDone,
  onRegenerate,
  pending,
}: {
  state: PortalAccessState;
  onDone: () => void;
  onRegenerate: () => void;
  pending: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const link = state.link!;

  const message =
    `Bonjour ${state.tenantName ?? ""}, voici votre accès à votre espace locataire. ` +
    `Ouvrez ce lien pour choisir votre mot de passe : ${link}`;

  // `wa.me` ouvre WhatsApp sur le numéro du locataire quand on l'a, et le
  // sélecteur de contact sinon. Les caractères non numériques sont retirés :
  // l'API n'accepte que des chiffres.
  const whatsapp = state.tenantPhone
    ? `https://wa.me/${state.tenantPhone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le lien
      // reste sélectionnable à la main dans le champ ci-dessous.
      toast.error("Copie impossible. Sélectionnez le lien manuellement.");
    }
  }

  return (
    <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-left">
      <p className="text-sm font-medium">Lien d&apos;activation prêt</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Valable 24 heures, utilisable une fois. Transmettez-le à{" "}
        {state.tenantName} — il ne sera plus affiché.
      </p>

      {/* Lecture seule : le lien doit pouvoir être sélectionné à la main si
          le presse-papiers est refusé, mais jamais modifié par mégarde. */}
      <input
        readOnly
        value={link}
        aria-label="Lien d'activation"
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copié" : "Copier"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" />
          }
        >
          <MessageCircle className="size-3.5" />
          WhatsApp
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onRegenerate}
        >
          <RefreshCw className="size-3.5" />
          Régénérer
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Terminé
        </Button>
      </div>
    </div>
  );
}
