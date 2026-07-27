"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth";
import {
  buildStoragePath,
  DOCUMENTS_BUCKET,
  sanitizeFileName,
} from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";
import { firstIssue, formDataToObject } from "@/lib/validation";

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

const uploadSchema = z.object({
  owner_type: z.enum([
    "organization",
    "building",
    "apartment",
    "tenant",
    "lease",
  ]),
  owner_id: z.string().trim(),
  visibility: z.enum(["private", "organization"]).default("organization"),
});

export async function uploadDocuments(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const parsed = uploadSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const organizationId = auth.session.organization.id;
  // Un document « organisation » n'a pas de cible : on le rattache à
  // l'organisation elle-même pour que owner_id reste NOT NULL.
  const ownerId =
    parsed.data.owner_type === "organization"
      ? organizationId
      : parsed.data.owner_id;

  if (!ownerId) return { error: "Sélectionnez l'élément à rattacher." };

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!files.length) return { error: "Aucun fichier sélectionné." };

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return { error: `« ${file.name} » dépasse 25 Mo.` };
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return { error: `Format non accepté pour « ${file.name} ».` };
    }
  }

  const supabase = await createClient();
  const uploaded: string[] = [];

  for (const file of files) {
    const storagePath = buildStoragePath({
      organizationId,
      ownerType: parsed.data.owner_type,
      ownerId,
      fileName: file.name,
    });

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      // Annuler les fichiers déjà déposés : soit tout le lot passe, soit rien.
      if (uploaded.length) {
        await supabase.storage.from(DOCUMENTS_BUCKET).remove(uploaded);
      }
      return { error: `Envoi impossible : ${uploadError.message}` };
    }
    uploaded.push(storagePath);

    const { error: insertError } = await supabase.from("documents").insert({
      organization_id: organizationId,
      owner_type: parsed.data.owner_type,
      owner_id: ownerId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      visibility: parsed.data.visibility,
      uploaded_by: auth.session.userId,
    });

    if (insertError) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove(uploaded);
      return { error: insertError.message };
    }
  }

  revalidatePath("/documents");
  return { ok: true };
}

export async function renameDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  const rawName = String(formData.get("file_name") ?? "").trim();

  if (!id) return { error: "Document introuvable." };
  if (!rawName) return { error: "Le nom ne peut pas être vide." };
  if (rawName.length > 160) return { error: "Le nom est trop long." };

  // Seul le libellé affiché change ; le chemin de stockage reste stable pour
  // ne pas invalider les URLs signées déjà distribuées.
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ file_name: sanitizeFileName(rawName) })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorize("owner", "manager");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Document introuvable." };

  const supabase = await createClient();

  const { data: doc, error: readError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .single<{ storage_path: string }>();

  if (readError) return { error: readError.message };

  // La ligne d'abord : si la suppression du fichier échoue, on ne laisse pas
  // un enregistrement pointant vers un objet disparu.
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return { error: error.message };

  const { error: storageError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([doc.storage_path]);

  revalidatePath("/documents");

  if (storageError) {
    return {
      ok: true,
      error: "Document retiré, mais le fichier n'a pas pu être effacé du stockage.",
    };
  }

  return { ok: true };
}
