import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PrintButton } from "@/components/print-button";
import { CashVoucherSheet } from "@/components/print/cash-voucher-sheet";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CashVoucher } from "@/lib/types";

export const metadata = { title: "Bon de caisse — CaisseOps" };

export default async function CashVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireSession();
  const { id } = await params;

  const supabase = await createClient();
  const { data: voucher } = await supabase
    .from("cash_vouchers")
    .select("*")
    .eq("id", id)
    .maybeSingle<CashVoucher>();

  if (!voucher) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/cash-vouchers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Tous les bons de caisse
        </Link>
        <PrintButton />
      </div>

      <div className="overflow-x-auto pb-2 print:overflow-visible print:pb-0">
        <CashVoucherSheet voucher={voucher} organization={organization} />
      </div>
    </div>
  );
}
