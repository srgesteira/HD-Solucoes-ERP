import type { Database } from "@/lib/types/database";

export type ReceivableRow = Database["public"]["Tables"]["receivables"]["Row"];
export type ReceivableInsert =
  Database["public"]["Tables"]["receivables"]["Insert"];
export type ReceivableUpdate =
  Database["public"]["Tables"]["receivables"]["Update"];

export const RECEIVABLE_STATUSES = [
  "pending",
  "partial",
  "paid",
  "overdue",
  "cancelled",
] as const;

export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];
