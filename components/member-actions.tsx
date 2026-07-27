"use client";

import { useState, useTransition } from "react";
import { UserMinus } from "lucide-react";
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
import { Button, NativeSelect } from "@/components/ui/kit";
import {
  removeMember,
  updateMemberRole,
} from "@/app/(dashboard)/team/actions";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

export function MemberActions({
  memberId,
  memberName,
  role,
  isSelf,
}: {
  memberId: string;
  memberName: string;
  role: UserRole;
  isSelf: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeRole(next: string) {
    const formData = new FormData();
    formData.set("member_id", memberId);
    formData.set("role", next);

    startTransition(async () => {
      const result = await updateMemberRole({}, formData);
      if (result.ok) {
        toast.success(
          `${memberName} est désormais ${ROLE_LABELS[next as UserRole]}.`,
        );
      } else {
        toast.error(result.error ?? "Le changement de rôle a échoué.");
      }
    });
  }

  function confirmRemove() {
    const formData = new FormData();
    formData.set("member_id", memberId);

    startTransition(async () => {
      const result = await removeMember({}, formData);
      setConfirmOpen(false);
      if (result.ok) toast.success(`${memberName} a été retiré.`);
      else toast.error(result.error ?? "Le retrait a échoué.");
    });
  }

  // Un propriétaire ne peut ni se rétrograder ni se retirer lui-même :
  // c'est la garantie qu'une organisation garde toujours un administrateur.
  if (isSelf) {
    return <span className="text-xs text-muted-foreground">Vous</span>;
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <NativeSelect
          defaultValue={role}
          disabled={pending}
          aria-label={`Rôle de ${memberName}`}
          className="h-8 w-40 text-xs"
          onChange={(event) => changeRole(event.target.value)}
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Retirer ${memberName}`}
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          <UserMinus className="size-4" />
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {memberName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Son accès à l&apos;organisation est révoqué immédiatement. Les
              données qu&apos;il a créées sont conservées, ainsi que ses
              entrées dans le journal d&apos;audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
