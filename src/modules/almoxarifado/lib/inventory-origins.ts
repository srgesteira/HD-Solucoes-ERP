export const INVENTORY_ORIGIN = {
  PURCHASE_RECEIVE: "purchase_receive",
  PURCHASE_INVOICE: "purchase_invoice",
  PRODUCTION_SUPPLY: "production_supply",
  PRODUCTION_FINISH: "production_finish",
  MANUAL_ADJUST: "manual_adjust",
} as const;

export type InventoryOrigin =
  (typeof INVENTORY_ORIGIN)[keyof typeof INVENTORY_ORIGIN];
