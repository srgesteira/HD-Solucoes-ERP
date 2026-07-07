export type BillingPlan = "nfe" | "without_invoice";
export type BillingClosure = "nfe" | "without_invoice";

export function isWithoutInvoicePlanned(plan: string | null | undefined): boolean {
  return plan === "without_invoice";
}

export function isWithoutInvoiceClosed(closure: string | null | undefined): boolean {
  return closure === "without_invoice";
}

export function billingNfeDisplayLabel(opts: {
  billing_plan: string | null;
  billing_closure: string | null;
  nfe_status: string | null;
}): { label: string; className: string } {
  if (isWithoutInvoiceClosed(opts.billing_closure)) {
    return {
      label: "Sem nota · concluído",
      className:
        "bg-slate-100 text-slate-800 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-200",
    };
  }
  if (isWithoutInvoicePlanned(opts.billing_plan)) {
    return {
      label: "Sem nota",
      className:
        "bg-violet-50 text-violet-900 ring-1 ring-violet-200 dark:bg-violet-950/35 dark:text-violet-100",
    };
  }
  return { label: "", className: "" };
}
