"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Field, NativeSelect } from "@/components/ui/kit";
import { uploadDocuments } from "@/app/(dashboard)/documents/actions";
import { cn } from "@/lib/utils";
import type { DocumentOwnerType } from "@/lib/types";

export type OwnerOption = { id: string; label: string };

const OWNER_TYPES: { value: DocumentOwnerType; label: string }[] = [
  { value: "organization", label: "Organisation" },
  { value: "building", label: "Immeuble" },
  { value: "apartment", label: "Logement" },
  { value: "tenant", label: "Locataire" },
  { value: "lease", label: "Bail" },
];

export function DocumentUploader({
  targets,
}: {
  targets: Record<Exclude<DocumentOwnerType, "organization" | "expense">, OwnerOption[]>;
}) {
  const [ownerType, setOwnerType] = useState<DocumentOwnerType>("building");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const options =
    ownerType === "organization"
      ? []
      : (targets[ownerType as keyof typeof targets] ?? []);

  const needsTarget = ownerType !== "organization";
  const blocked = needsTarget && options.length === 0;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)]);
  }

  function submit(formData: FormData) {
    if (!files.length) {
      toast.error("Ajoutez au moins un fichier.");
      return;
    }

    // Le champ <input type="file"> n'est pas la source de vérité : la liste
    // peut venir d'un glisser-déposer. On repeuple le FormData à la main.
    formData.delete("files");
    for (const file of files) formData.append("files", file);

    startTransition(async () => {
      const result = await uploadDocuments({}, formData);
      if (result.ok) {
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
        toast.success(
          files.length > 1
            ? `${files.length} documents déposés.`
            : "Document déposé.",
        );
      } else {
        toast.error(result.error ?? "L'envoi a échoué.");
      }
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Rattacher à">
          <NativeSelect
            name="owner_type"
            value={ownerType}
            onChange={(e) => setOwnerType(e.target.value as DocumentOwnerType)}
          >
            {OWNER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Élément">
          <NativeSelect name="owner_id" disabled={!needsTarget || blocked}>
            {!needsTarget && <option value="">Organisation entière</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            {blocked && <option value="">Aucun élément disponible</option>}
          </NativeSelect>
        </Field>

        <Field label="Visibilité">
          <NativeSelect name="visibility" defaultValue="organization">
            <option value="organization">Toute l&apos;organisation</option>
            <option value="private">Restreint</option>
          </NativeSelect>
        </Field>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <FileUp className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Glissez vos fichiers ici, ou
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Parcourir
        </Button>
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt,.csv"
        />
        <p className="text-xs text-muted-foreground">
          PDF, images, Word, Excel, CSV — 25 Mo par fichier.
        </p>
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(0)} Ko
              </span>
              <button
                type="button"
                aria-label={`Retirer ${file.name}`}
                onClick={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="submit" size="lg" disabled={pending || blocked}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending
            ? "Envoi en cours…"
            : `Déposer ${files.length || ""} document${files.length > 1 ? "s" : ""}`}
        </Button>
      </div>
    </form>
  );
}
