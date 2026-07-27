"use client";

import { useState, useTransition, type ReactNode } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, ErrorText } from "@/components/ui/kit";
import { deleteEntity } from "@/app/(dashboard)/crud-actions";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Menu d'actions de ligne : édition dans un dialogue, suppression derrière
 * une confirmation explicite.
 *
 * Les champs du formulaire d'édition sont fournis par le Server Component
 * appelant, déjà pré-remplis — le client n'a pas à refaire une requête pour
 * connaître les valeurs courantes.
 */
export function RowActions({
  entityLabel,
  editTitle,
  editAction,
  editFields,
  deleteTable,
  deleteId,
  deleteDescription,
  canEdit = true,
  canDelete = true,
}: {
  entityLabel: string;
  editTitle: string;
  editAction: Action;
  editFields: ReactNode;
  deleteTable: string;
  deleteId: string;
  deleteDescription: string;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!canEdit && !canDelete) return null;

  function submitEdit(formData: FormData) {
    startTransition(async () => {
      const result = await editAction({}, formData);
      if (result.ok) {
        setError(undefined);
        setEditOpen(false);
        toast.success(`${entityLabel} mis à jour.`);
      } else {
        setError(result.error ?? "La modification a échoué.");
      }
    });
  }

  function confirmDelete() {
    const formData = new FormData();
    formData.set("table", deleteTable);
    formData.set("id", deleteId);

    startTransition(async () => {
      const result = await deleteEntity({}, formData);
      if (result.ok) {
        setConfirmOpen(false);
        toast.success(`${entityLabel} supprimé.`);
      } else {
        setConfirmOpen(false);
        toast.error(result.error ?? "La suppression a échoué.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              Modifier
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Supprimer
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editTitle}</DialogTitle>
            <DialogDescription>
              Les modifications sont enregistrées dans le journal d&apos;audit.
            </DialogDescription>
          </DialogHeader>

          <form action={submitEdit} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={deleteId} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {editFields}
            </div>
            <ErrorText>{error}</ErrorText>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setEditOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
