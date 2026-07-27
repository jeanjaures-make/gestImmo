"use client";

import { useState, useTransition } from "react";
import { KeyRound, Send, ShieldOff } from "lucide-react";
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
  revokePortalAccess,
} from "@/app/(dashboard)/tenants/portal-access";

/**
 * Ouverture de l'espace locataire depuis la fiche du locataire.
 *
 * Les deux opérations sont irréversibles du point de vue de l'utilisateur
 * (un e-mail part, un compte disparaît) : chacune passe donc par une
 * confirmation qui dit ce qui va réellement se produire.
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
  const [pending, startTransition] = useTransition();

  function run(
    action: typeof grantPortalAccess,
    successMessage: string,
  ) {
    const formData = new FormData();
    formData.set("tenant_id", tenantId);

    startTransition(async () => {
      const result = await action({}, formData);
      setConfirmOpen(false);
      if (result.ok) toast.success(successMessage);
      else toast.error(result.error ?? "L'opération a échoué.");
    });
  }

  if (hasAccess) {
    return (
      <>
        <div className="flex items-center justify-end gap-2">
          <StatusBadge tone="success">Accès ouvert</StatusBadge>
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
                  run(revokePortalAccess, `L'espace de ${tenantName} est fermé.`)
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

  // Deux empêchements distincts, deux messages distincts : « indisponible »
  // sans dire pourquoi laisserait chercher au mauvais endroit.
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
              Une invitation part à l&apos;instant vers {email}. {tenantName}{" "}
              choisira son mot de passe, puis accédera à son bail, ses
              quittances et ses interventions — et à rien d&apos;autre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(grantPortalAccess, `Invitation envoyée à ${email}.`)
              }
            >
              <Send className="size-3.5" />
              Envoyer l&apos;invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
