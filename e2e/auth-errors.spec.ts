import { test, expect } from "@playwright/test";

/**
 * Un lien d'authentification mort doit le DIRE.
 *
 * Deux couches, et les deux étaient muettes.
 *
 * `/login?error=…` d'abord : sept routes du produit y redirigent avec un
 * code — lien d'activation périmé, réclamation déjà consommée, trop de
 * tentatives — et la page ne le lisait pas. La personne atterrissait sur
 * un formulaire vierge, sans savoir si son lien était mort ou si le
 * produit était en panne.
 *
 * Le rebond Supabase ensuite. Un lien de « mot de passe oublié » transite
 * par le domaine Supabase ; quand le jeton est mort, Supabase redirige
 * vers le *Site URL* du projet en plaçant la cause dans le FRAGMENT de
 * l'URL. Un fragment n'atteint jamais le serveur : sans code navigateur,
 * personne ne peut le lire, et l'on retombe sur la page de vente.
 */

test.describe("liens d'authentification expirés", () => {
  test("la page de connexion explique pourquoi le lien a échoué", async ({
    page,
  }) => {
    await page.goto("/login?error=lien-expire");
    await expect(
      page.getByText(/n'est plus valable|a déjà servi/i),
    ).toBeVisible();

    await page.goto("/login?error=trop-de-tentatives");
    await expect(page.getByText(/trop de tentatives/i)).toBeVisible();

    // Un code inconnu ne doit rien afficher plutôt qu'un message vide ou
    // le code brut : une URL bricolée à la main ne mérite pas d'écran.
    await page.goto("/login?error=nimporte-quoi");
    await expect(page.getByText(/n'est plus valable/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Se connecter" }),
    ).toBeVisible();
  });

  test("le rebond Supabase, dont l'erreur vit dans le fragment", async ({
    page,
  }) => {
    // L'URL exacte que Supabase produit quand un lien de récupération est
    // périmé : la cause est dans la query ET dans le fragment, et seul le
    // navigateur voit le second.
    await page.goto(
      "/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" +
        "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    await page.waitForURL(/\/login\?error=lien-expire/);
    await expect(
      page.getByText(/n'est plus valable|a déjà servi/i),
    ).toBeVisible();
  });

  test("un fragment sans erreur ne déclenche rien", async ({ page }) => {
    // La garde ne réagit qu'aux paramètres propres à Supabase. Confondre
    // notre `?error=lien-expire` avec les siens boucherait : chaque
    // arrivée sur /login en déclencherait une nouvelle.
    await page.goto("/#section-tarifs");
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goto("/login?error=lien-expire");
    await page.waitForTimeout(1_000);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("lien-expire");
  });
});
