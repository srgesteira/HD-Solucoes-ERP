import { redirect } from "next/navigation";

export default function FinancePayablesPage() {
  redirect("/finance/contas?tab=pagar");
}
