import { ImageResponse } from "next/og";

/**
 * Icône d'écran d'accueil iOS.
 *
 * Safari ignore le SVG pour ce rôle : sans ce fichier, ajouter le site à
 * son écran d'accueil produit une capture floue de la page. Sur le marché
 * visé, où l'on consulte d'abord au téléphone, c'est le geste qui vaut un
 * raccourci d'application.
 *
 * Généré à la compilation plutôt que dessiné, comme la vignette de
 * partage : à 180 pixels, la lisibilité n'est plus en cause, et le code
 * suit la couleur de marque sans qu'on pense à réexporter un PNG.
 *
 * Fond plein, sans coins arrondis : iOS applique son propre masque, et
 * arrondir deux fois laisse un liseré.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#355C7D",
          color: "#FAFAF8",
          fontSize: 116,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        C
      </div>
    ),
    size,
  );
}
