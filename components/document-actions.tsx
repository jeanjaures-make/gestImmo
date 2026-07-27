"use client";

import { useState, useTransition } from "react";
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
import { Button, ErrorText, Field, Input } from "@/components/ui/kit";
import {
  deleteDocument,
  renameDocument,
} from "@/app/(dashboard)/documents/actions";

export function DocumentActions({
  id,
  fileName,
}: {
  id: string;
  fileName: string;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submitRename(formData: FormData) {
    startTransition(async () => {
      const result = await renameDocument({}, formData);
      if (result.ok) {
        setError(undefined);
        setRenameOpen(false);
        toast.success("Document renommé.");
      } else {
        setError(result.error ?? "Le renommage a échoué.");
      }
    });
  }

  function confirmDelete() {
    const formData = new FormData();
    formData.set("id", id);

    startTransition(async () => {
      const result = await deleteDocument({}, formData);
      setConfirmOpen(false);
      if (result.ok && result.error) toast.warning(result.error);
      else if (result.ok) toast.success("Document supprimé.");
      else toast.error(result.error ?? "La suppression a échoué.");
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
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil className="size-3.5" />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-3.5" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le document</DialogTitle>
            <DialogDescription>
              Seul le libellé affiché change ; les liens déjà partagés restent
              valides.
            </DialogDescription>
          </DialogHeader>

          <form action={submitRename} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={id} />
            <Field label="Nom du fichier">
              <Input name="file_name" defaultValue={fileName} required />
            </Field>
            <ErrorText>{error}</ErrorText>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setRenameOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Enregistrement…" : "Renommer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {fileName} » sera retiré de la liste et le fichier effacé du
              stockage. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
