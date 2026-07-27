"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PERIODS, type Period } from "@/lib/periods";
import { cn } from "@/lib/utils";

export function PeriodSelector({ current }: { current: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(months: Period) {
    const params = new URLSearchParams(searchParams);
    params.set("months", String(months));
    router.push(`${pathname}?${params}`);
  }

  return (
    <div
      role="group"
      aria-label="Période affichée"
      className="inline-flex rounded-lg border p-0.5"
    >
      {PERIODS.map((months) => (
        <button
          key={months}
          type="button"
          aria-pressed={months === current}
          onClick={() => select(months)}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors",
            months === current
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {months} mois
        </button>
      ))}
    </div>
  );
}
