import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DocumentOwnerType } from "@/lib/types";

export const DOCUMENTS_BUCKET = "documents";

/** Durée de validité des liens de téléchargement. */
export const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Neutralise tout ce qui pourrait sortir du dossier de l'organisation.
 * Liste blanche stricte : seuls [a-zA-Z0-9._-] survivent, ce qui élimine
 * d'office les `..`, les séparateurs de chemin et les accents.
 */
export function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+/, "")
    .slice(0, 120);
  return cleaned || "document";
}

/**
 * Chemin de stockage. Le premier segment est l'organisation : c'est
 * exactement ce que la policy RLS de `storage.objects` compare.
 */
export function buildStoragePath({
  organizationId,
  ownerType,
  ownerId,
  fileName,
}: {
  organizationId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  fileName: string;
}) {
  const unique = `${Date.now()}-${sanitizeFileName(fileName)}`;
  return `${organizationId}/${ownerType}/${ownerId}/${unique}`;
}

/**
 * URL signée temporaire. Le bucket est privé : c'est le seul moyen de
 * télécharger un document, et le lien expire.
 */
export async function createSignedDownloadUrl(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download: true });

  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl, error: null };
}
