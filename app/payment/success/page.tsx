import { redirect } from "next/navigation";

export default async function PaymentSuccessRedirect({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const target = ref ? `/billing/success?ref=${encodeURIComponent(ref)}` : "/billing/success";
  redirect(target);
}
