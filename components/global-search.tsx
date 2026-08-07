"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  PackageOpen,
  ReceiptText,
  Search,
  Wallet,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, Input } from "@/components/ui/kit";
import { createClient } from "@/lib/supabase/client";

type SearchHit = {
  entity: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

// Les clés viennent de `global_search()` : elles sont au singulier, comme la
// pièce qu'un résultat désigne.
const ICONS: Record<string, typeof ReceiptText> = {
  receipt: ReceiptText,
  cash_voucher: Wallet,
  delivery_note: PackageOpen,
};

const ENTITY_LABELS: Record<string, string> = {
  receipt: "Reçu",
  cash_voucher: "Bon de caisse",
  delivery_note: "Bon de sortie",
};

const MIN_LENGTH = 2;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  // `useDeferredValue` remplace un debounce maison : pas d'effet, pas de
  // timer à nettoyer, et React garde l'ancien résultat pendant la frappe.
  const deferred = useDeferredValue(query);
  const enabled = deferred.trim().length >= MIN_LENGTH;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data, isFetching, error } = useQuery({
    queryKey: ["global-search", deferred.trim()],
    enabled,
    queryFn: async () => {
      // Le RPC est en SECURITY INVOKER : le RLS s'applique, la recherche ne
      // peut donc rien révéler d'une autre organisation.
      const supabase = createClient();
      const { data, error } = await supabase.rpc("global_search", {
        q: deferred.trim(),
        max_results: 20,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as SearchHit[];
    },
  });

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const results = data ?? [];

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search className="size-4" />
        {/* `sr-only` plutôt que `hidden` : sous le seuil `sm`, le bouton se
            réduit à son icône et n'avait plus aucun nom accessible — un
            lecteur d'écran annonçait « bouton », rien de plus. Le libellé
            reste donc dans le DOM, simplement masqué à l'œil. */}
        <span className="sr-only sm:not-sr-only">Rechercher</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
          Ctrl K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 max-w-xl translate-y-0 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Recherche globale</DialogTitle>
            <DialogDescription>
              Rechercher dans les reçus, les bons de caisse et les bons de
              sortie : par numéro, par nom ou par motif.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Numéro, nom, motif…"
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
              aria-label="Terme de recherche"
            />
            {isFetching && (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {!enabled && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Saisissez au moins {MIN_LENGTH} caractères.
              </p>
            )}

            {enabled && error && (
              <p className="p-4 text-center text-sm text-destructive">
                La recherche a échoué. Réessayez.
              </p>
            )}

            {enabled && !error && !isFetching && results.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Aucun résultat pour « {deferred.trim()} ».
              </p>
            )}

            <ul>
              {results.map((hit) => {
                const Icon = ICONS[hit.entity] ?? FileText;
                return (
                  <li key={`${hit.entity}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() => go(hit.href)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {hit.title}
                        </span>
                        {hit.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ENTITY_LABELS[hit.entity] ?? hit.entity}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
