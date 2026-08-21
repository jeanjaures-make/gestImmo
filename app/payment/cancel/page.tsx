import { redirect } from "next/navigation";

export default function PaymentCancelRedirect() {
  redirect("/billing/cancel");
}
