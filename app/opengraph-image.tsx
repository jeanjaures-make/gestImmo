import { ImageResponse } from "next/og";

import { SITE } from "@/lib/site";

/**
 * Vignette de partage, générée à la compilation.
 *
 * Produite par le code plutôt que dessinée : elle suit le nom et la
 * promesse du produit sans qu'on pense à réexporter un fichier. Aucune
 * police n'est chargée à distance — un échec réseau au moment du rendu
 * donnerait une image cassée là où l'on joue la première impression.
 */
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAFAF8",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#355C7D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FAFAF8",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, color: "#1F2937" }}>
            {SITE.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 600,
              lineHeight: 1.1,
              color: "#1F2937",
              letterSpacing: -1.5,
              maxWidth: 900,
            }}
          >
            {`${SITE.tagline}.`}
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              color: "#55606F",
              maxWidth: 860,
            }}
          >
            {"Numérotation continue, montant en toutes lettres, impression fidèle — dans un espace sécurisé réservé à votre entreprise."}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 4, background: "#6C8F7D" }} />
          <div style={{ fontSize: 24, color: "#55606F" }}>
            Exports Excel inclus · Hébergement en Europe
          </div>
        </div>
      </div>
    ),
    size,
  );
}
