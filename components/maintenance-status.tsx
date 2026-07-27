"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/ui/kit";
import { updateMaintenanceStatus } from "@/app/(dashboard)/maintenance/actions";
import { MAINTENANCE_STATUS_LABELS, type MaintenanceStatus } from "@/lib/types";

export function MaintenanceStatusSelect({
  id,
  status,
}: {
  id: string;
  status: MaintenanceStatus;
}) {
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const formData = new FormData();
    formData.set("maintenance_id", id);
    formData.set("status", next);

    startTransition(async () => {
      const result = await updateMaintenanceStatus({}, formData);
      if (result.ok) {
        toast.success(
          `Intervention : ${MAINTENANCE_STATUS_LABELS[next as MaintenanceStatus]}.`,
        );
      } else {
        toast.error(result.error ?? "Le changement de statut a échoué.");
      }
    });
  }

  return (
    <NativeSelect
      defaultValue={status}
      disabled={pending}
      aria-label="Statut de l'intervention"
      className="h-8 w-36 text-xs"
      onChange={(event) => onChange(event.target.value)}
    >
      {Object.entries(MAINTENANCE_STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </NativeSelect>
  );
}
