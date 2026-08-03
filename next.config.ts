import type { NextConfig } from "next";

/**
 * Hôte du projet Supabase, déduit de l'URL publique.
 *
 * `next/image` refuse par défaut toute source distante : sans cette
 * autorisation, le logo d'une organisation renverrait une 400 au lieu de
 * s'afficher. On n'ouvre que l'hôte réellement utilisé, et uniquement le
 * chemin des objets publics — pas une autorisation générale à Supabase,
 * qui laisserait passer n'importe quel bucket.
 */
function supabaseHost() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const host = supabaseHost();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: host
      ? [
          {
            protocol: "https",
            hostname: host,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
