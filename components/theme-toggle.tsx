"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/kit";

/**
 * Bascule clair / sombre.
 *
 * Les deux icônes sont rendues et c'est CSS qui choisit selon la classe
 * `.dark` posée sur <html> par next-themes. Pas d'état « monté », donc pas
 * de divergence d'hydratation ni de rendu en cascade.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Changer de thème"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
