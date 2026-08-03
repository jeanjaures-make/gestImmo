"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";

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
import { Button } from "@/components/ui/kit";
import { signOutEverywhere } from "@/app/(dashboard)/settings/actions";

/**
 * Coupe toutes les sessions du compte, la sienne comprise.
 *
 * La confirmation n'est pas décorative : le geste déconnecte l'appareil
 * depuis lequel on le déclenche. Le dire à l'avance évite de le prendre
 * pour une panne.
 */
export function SignOutEverywhere() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <LogOut className="size-4" />
        Déconnecter tous les appareils
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fermer toutes les sessions ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous les appareils connectés à ce compte seront déconnectés,
              y compris celui-ci. Vous devrez vous reconnecter. Vos données
              ne sont pas touchées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => startTransition(() => signOutEverywhere())}
            >
              {pending ? "Fermeture…" : "Tout déconnecter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
