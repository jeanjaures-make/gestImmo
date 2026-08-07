/* eslint-disable @next/next/no-img-element */
import type { Organization } from "@/lib/types";

/**
 * L'en-tête que chaque entreprise imprime en haut de ses pièces.
 *
 * C'est le cœur du produit : le même reçu, la même mise en page, mais
 * l'identité de celui qui l'émet. Le composant se contente donc de
 * refléter les réglages de l'organisation — il n'invente aucune valeur et
 * n'affiche pas de bloc vide quand un champ n'est pas renseigné.
 *
 * ─── Pourquoi <img> et non next/image ───────────────────────────────────
 * `next/image` sert une image optimisée par un composant client, avec
 * chargement différé et jeu de tailles. À l'impression, ce mécanisme joue
 * contre nous : la boîte de dialogue s'ouvre avant que l'image
 * paresseuse ne soit chargée, et le logo manque sur le papier. Une balise
 * simple, chargée avec le document, est ici la bonne réponse.
 */

/** Deux variantes, correspondant aux deux gabarits de carnet. */
type Variant =
  /** En-tête large : logo, accroche et activités, puis bandeau de contact. */
  | "full"
  /** En-tête compact : logo et coordonnées empilées à gauche. */
  | "compact";

export function Letterhead({
  organization,
  variant = "full",
}: {
  organization: Organization;
  variant?: Variant;
}) {
  const {
    name,
    legal_form,
    trade_name,
    tagline,
    activities,
    address,
    phone,
    phone_alt,
    email,
    email_alt,
    website,
    logo_url,
  } = organization;

  const phones = [phone, phone_alt].filter(Boolean);
  const emails = [email, email_alt].filter(Boolean);

  const identity = (
    <div className="flex items-center gap-2">
      {logo_url && (
        <img
          src={logo_url}
          alt=""
          className="h-12 w-auto max-w-[110px] object-contain"
        />
      )}
      <div className="leading-tight">
        <p className="text-xl font-extrabold tracking-tight">
          {name}
          {legal_form && (
            <span className="ml-1.5 align-baseline text-[11px] font-bold">
              {legal_form}
            </span>
          )}
        </p>
        {trade_name && (
          <p className="text-[7.5px] font-semibold">{trade_name}</p>
        )}
      </div>
    </div>
  );

  if (variant === "compact") {
    return (
      <div className="leading-tight">
        {identity}
        <div className="mt-1 text-[9px] font-semibold">
          {phones.length > 0 && <p>Cel : {phones.join(" / ")}</p>}
          {emails.length > 0 && <p>E-mail : {emails.join(" / ")}</p>}
        </div>
      </div>
    );
  }

  return (
    <header>
      <div className="flex items-start justify-between gap-4">
        {identity}

        {tagline && (
          <p className="max-w-[28%] text-[11px] leading-snug font-bold text-[#c0392b]">
            {tagline}
          </p>
        )}

        {activities.length > 0 && (
          <ul className="max-w-[46%] text-[9px] leading-snug font-semibold">
            {activities.map((activity) => (
              <li key={activity} className="flex gap-1">
                <span aria-hidden>-</span>
                <span>{activity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Le filet vert sous l'en-tête, puis le bandeau de coordonnées
          centré : c'est la disposition des carnets imprimés localement. */}
      {(address || phones.length > 0 || emails.length > 0 || website) && (
        <>
          <div className="mt-1 h-[3px] bg-[#8bc34a]" />
          <div className="mt-1 text-center text-[9px] leading-tight font-bold">
            {(address || phones.length > 0) && (
              <p>
                {address}
                {address && phones.length > 0 && " - "}
                {phones.length > 0 && `Cel: ${phones.join(" / ")}`}
              </p>
            )}
            {(emails.length > 0 || website) && (
              <p>
                {emails.length > 0 && `E-mail: ${emails.join(" / ")}`}
                {emails.length > 0 && website && " / "}
                {website}
              </p>
            )}
          </div>
        </>
      )}
    </header>
  );
}

/**
 * L'en-tête isolé, sur fond blanc, pour l'écran de réglages.
 *
 * Régler une adresse sans voir où elle atterrit oblige à émettre une
 * pièce pour vérifier, puis à la supprimer — ce qui troue la
 * numérotation. L'aperçu évite ce détour.
 */
export function LetterheadPreview({
  organization,
}: {
  organization: Organization;
}) {
  return (
    <div className="min-w-[560px] text-black">
      <Letterhead organization={organization} />
    </div>
  );
}
