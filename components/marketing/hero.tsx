"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { ShieldCheck, Smartphone } from "lucide-react";

import { DashboardMockup } from "@/components/marketing/mockups";
import { Container, PrimaryLink, SecondaryLink } from "@/components/marketing/ui";

/**
 * Premier écran.
 *
 * `LazyMotion` avec le seul jeu `domAnimation` : les fonctions de mise en
 * page et de tracé de Motion ne servent pas ici, les charger reviendrait à
 * faire payer au visiteur du code jamais exécuté. Sur une page dont
 * l'affaire se joue en deux secondes, c'est le mauvais arbitrage.
 *
 * `useReducedMotion` court-circuite entièrement l'animation plutôt que de
 * l'adoucir : une préférence système n'est pas un curseur d'intensité.
 */
export function Hero() {
  const reduced = useReducedMotion();

  const rise = (delay: number) =>
    reduced
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.55,
            delay,
            // Décélération franche puis arrêt net : le mouvement se pose
            // au lieu de flotter.
            ease: [0.22, 0.61, 0.36, 1] as const,
          },
        };

  return (
    <LazyMotion features={domAnimation} strict>
      <section className="relative overflow-hidden pt-14 pb-20 sm:pt-20 sm:pb-28">
        {/* Halo très dilué : donne une profondeur au fond sans introduire
            de dégradé saturé. Décoratif, donc masqué aux lecteurs d'écran. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] opacity-60"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--m-deep) 12%, transparent), transparent 70%)",
          }}
        />

        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div>
              <m.p
                {...rise(0)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--m-line)] bg-[var(--m-surface)] px-3 py-1.5 text-xs font-medium text-[var(--m-ink-soft)]"
              >
                <ShieldCheck className="size-3.5 text-[var(--m-sage-text)]" />
                Cloisonnement vérifié par un script exécutable
              </m.p>

              <m.h1
                {...rise(0.06)}
                className="font-heading mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]"
              >
                Reçus, bons de caisse et bons de sortie, à votre en-tête.
              </m.h1>

              <m.p
                {...rise(0.12)}
                className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--m-ink-soft)] text-pretty"
              >
                CaisseOps émet et imprime les trois pièces de votre comptoir —
                numérotation continue, montant en toutes lettres, journal
                d&apos;audit — dans un espace sécurisé réservé à votre
                entreprise.
              </m.p>

              <m.div
                {...rise(0.18)}
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <PrimaryLink href="/signup">Commencer gratuitement</PrimaryLink>
                <SecondaryLink href="#demonstration">
                  Demander une démonstration
                </SecondaryLink>
              </m.div>

              <m.p
                {...rise(0.24)}
                className="mt-6 flex items-center gap-2 text-sm text-[var(--m-ink-soft)]"
              >
                <Smartphone className="size-4" />
                Pensé d&apos;abord pour le comptoir et le téléphone · Sans
                carte bancaire
              </m.p>
            </div>

            <m.div
              {...(reduced
                ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
                : {
                    initial: { opacity: 0, y: 24 },
                    animate: { opacity: 1, y: 0 },
                    transition: {
                      duration: 0.7,
                      delay: 0.15,
                      ease: [0.22, 0.61, 0.36, 1] as const,
                    },
                  })}
            >
              <DashboardMockup />
            </m.div>
          </div>
        </Container>
      </section>
    </LazyMotion>
  );
}
