import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Notification, NotificationKind } from "@/lib/types";

/**
 * Types que le compte connecté a coupés.
 *
 * Lu une fois par rendu grâce à `cache()`. En cas d'échec — schéma pas
 * encore à jour, colonne absente — on rend une liste vide : mieux vaut
 * afficher une notification de trop que de masquer toute la pile.
 */
const mutedKinds = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("profiles")
    .select("muted_notifications")
    .eq("id", user.id)
    .maybeSingle<{ muted_notifications: string[] | null }>();

  return data?.muted_notifications ?? [];
});

/** Format attendu par PostgREST pour `not.in` : `("a","b")`. */
function asInList(values: string[]) {
  return `(${values.map((v) => `"${v}"`).join(",")})`;
}

/**
 * Lecture des notifications du compte connecté.
 *
 * Aucun filtre applicatif sur le destinataire : la policy `notifications_select`
 * limite déjà la table aux lignes dont `recipient_id` est l'utilisateur
 * courant. Ajouter un `.eq()` ici donnerait l'illusion que c'est lui qui
 * protège — et masquerait la vraie garantie.
 */
export const getNotifications = cache(
  async (
    from: number,
    to: number,
  ): Promise<{ items: Notification[]; total: number }> => {
    const supabase = await createClient();
    const muted = await mutedKinds();

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (muted.length) query = query.not("kind", "in", asInList(muted));

    const { data, count } = await query.returns<Notification[]>();

    return { items: data ?? [], total: count ?? 0 };
  },
);

/**
 * Nombre de notifications non lues, pour la pastille de navigation.
 *
 * `head: true` : seul le compte voyage, pas les lignes. Cette requête part
 * à chaque rendu de la barre de navigation, elle doit rester gratuite.
 */
export const getUnreadCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const muted = await mutedKinds();

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);

  // La pastille doit compter ce que l'écran montrera : un « 3 » qui mène à
  // une liste vide se lit comme une panne.
  if (muted.length) query = query.not("kind", "in", asInList(muted));

  const { count } = await query;
  return count ?? 0;
});

/** Libellés des types que l'on peut couper, dans l'ordre d'affichage. */
export const NOTIFICATION_PREFERENCES: {
  kind: NotificationKind;
  label: string;
  hint: string;
}[] = [
  {
    kind: "payment_declared",
    label: "Règlement déclaré",
    hint: "Un locataire signale avoir payé et attend votre validation.",
  },
  {
    kind: "payment_recorded",
    label: "Encaissement enregistré",
    hint: "Une échéance vient d'être soldée.",
  },
  {
    kind: "payment_declaration_reviewed",
    label: "Déclaration tranchée",
    hint: "Votre déclaration de règlement a été acceptée ou refusée.",
  },
  {
    kind: "incident_declared",
    label: "Intervention signalée",
    hint: "Un locataire déclare un incident sur son logement.",
  },
  {
    kind: "incident_updated",
    label: "Intervention mise à jour",
    hint: "L'état d'une intervention a changé.",
  },
  {
    kind: "lease_created",
    label: "Nouveau bail",
    hint: "Un bail vient d'être créé sur le parc.",
  },
];
