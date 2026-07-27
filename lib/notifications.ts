import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";

/**
 * Lecture des notifications du compte connecté.
 *
 * Aucun filtre applicatif sur le destinataire : la policy `notifications_select`
 * limite déjà la table aux lignes dont `recipient_id` est l'utilisateur
 * courant. Ajouter un `.eq()` ici donnerait l'illusion que c'est lui qui
 * protège — et masquerait la vraie garantie.
 */
export const getNotifications = cache(async (limit = 50): Promise<
  Notification[]
> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Notification[]>();

  return data ?? [];
});

/**
 * Nombre de notifications non lues, pour la pastille de navigation.
 *
 * `head: true` : seul le compte voyage, pas les lignes. Cette requête part
 * à chaque rendu de la barre de navigation, elle doit rester gratuite.
 */
export const getUnreadCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);

  return count ?? 0;
});
