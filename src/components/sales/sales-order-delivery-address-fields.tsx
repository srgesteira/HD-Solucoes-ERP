"use client";

import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import {
  BRAZIL_UF_CODES,
  formatCepDisplay,
  type SalesOrderDeliveryAddress,
} from "@/modules/vendas/lib/sales/sales-order-delivery-address";
import { cn } from "@/shared/utils/cn";

type Props = {
  value: SalesOrderDeliveryAddress;
  onChange: (next: SalesOrderDeliveryAddress) => void;
  disabled?: boolean;
};

export function SalesOrderDeliveryAddressFields({
  value,
  onChange,
  disabled = false,
}: Props) {
  const set =
    <K extends keyof SalesOrderDeliveryAddress>(key: K) =>
    (raw: SalesOrderDeliveryAddress[K]) =>
      onChange({ ...value, [key]: raw });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <input
          id="so-delivery-different"
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300"
          checked={value.delivery_address_different}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              delivery_address_different: e.target.checked,
            })
          }
        />
        <div>
          <Label htmlFor="so-delivery-different" className="font-normal">
            Entrega em endereço diferente do faturamento
          </Label>
          <p className="text-xs text-slate-500 mt-0.5">
            O endereço do cadastro do cliente continua a ser o de faturamento
            (destinatário da NF-e). Marque só se a mercadoria for para outro
            local.
          </p>
        </div>
      </div>

      {value.delivery_address_different ? (
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="space-y-1.5 sm:col-span-4">
            <Label htmlFor="so-del-street">
              Rua <span className="text-red-600">*</span>
            </Label>
            <Input
              id="so-del-street"
              value={value.delivery_street ?? ""}
              onChange={(e) => set("delivery_street")(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="so-del-number">
              Número <span className="text-red-600">*</span>
            </Label>
            <Input
              id="so-del-number"
              value={value.delivery_number ?? ""}
              onChange={(e) => set("delivery_number")(e.target.value)}
              disabled={disabled}
              placeholder="S/N"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="so-del-comp">Complemento</Label>
            <Input
              id="so-del-comp"
              value={value.delivery_complement ?? ""}
              onChange={(e) => set("delivery_complement")(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="so-del-neigh">
              Bairro <span className="text-red-600">*</span>
            </Label>
            <Input
              id="so-del-neigh"
              value={value.delivery_neighborhood ?? ""}
              onChange={(e) => set("delivery_neighborhood")(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="so-del-city">
              Cidade <span className="text-red-600">*</span>
            </Label>
            <Input
              id="so-del-city"
              value={value.delivery_city ?? ""}
              onChange={(e) => set("delivery_city")(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="so-del-uf">
              UF <span className="text-red-600">*</span>
            </Label>
            <select
              id="so-del-uf"
              className={cn(
                "h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm",
                "dark:bg-slate-950 dark:border-slate-600"
              )}
              value={value.delivery_state ?? ""}
              disabled={disabled}
              onChange={(e) => set("delivery_state")(e.target.value || null)}
            >
              <option value="">—</option>
              {BRAZIL_UF_CODES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="so-del-zip">
              CEP <span className="text-red-600">*</span>
            </Label>
            <Input
              id="so-del-zip"
              value={formatCepDisplay(value.delivery_zip)}
              onChange={(e) =>
                set("delivery_zip")(
                  e.target.value.replace(/\D/g, "").slice(0, 8)
                )
              }
              disabled={disabled}
              inputMode="numeric"
              placeholder="00000-000"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
