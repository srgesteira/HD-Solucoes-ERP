"use client";

import { BrDateInput } from "@/shared/ui/br-date-input";
import { Label } from "@/shared/ui/label";
import type { CustomerOption } from "@/components/sales/customer-quick-create-modal";
import { CustomerSearchField } from "@/components/sales/customer-search-field";
import { PaymentTermsFields } from "@/components/shared/payment-terms-fields";
import { Input } from "@/shared/ui/input";

export type SalesOrderFormFieldsProps = {
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  onCustomerSelected?: (customer: CustomerOption | null) => void;
  clientEmail: string;
  onClientEmailChange: (value: string) => void;
  expectedDelivery: string;
  onExpectedDeliveryChange: (value: string) => void;
  paymentInstallments: string;
  onPaymentInstallmentsChange: (value: string) => void;
  paymentDaysFirst: string;
  onPaymentDaysFirstChange: (value: string) => void;
  paymentDaysBetween: string;
  onPaymentDaysBetweenChange: (value: string) => void;
  seedCustomer?: CustomerOption | null;
  disabled?: boolean;
};

export function SalesOrderFormFields({
  customerId,
  onCustomerIdChange,
  onCustomerSelected,
  clientEmail,
  onClientEmailChange,
  expectedDelivery,
  onExpectedDeliveryChange,
  paymentInstallments,
  onPaymentInstallmentsChange,
  paymentDaysFirst,
  onPaymentDaysFirstChange,
  paymentDaysBetween,
  onPaymentDaysBetweenChange,
  seedCustomer,
  disabled = false,
}: SalesOrderFormFieldsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <CustomerSearchField
            customerId={customerId}
            onCustomerIdChange={onCustomerIdChange}
            onCustomerSelected={onCustomerSelected}
            clientEmail={clientEmail}
            onClientEmailChange={onClientEmailChange}
            seedCustomer={seedCustomer}
            disabled={disabled}
            inputId="so-customer-search"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="so-client-email">E-mail do cliente</Label>
          <Input
            id="so-client-email"
            type="email"
            value={clientEmail}
            onChange={(e) => onClientEmailChange(e.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="so-expected-delivery">
            Prazo de entrega ao cliente{" "}
            <span className="text-red-600">*</span>
          </Label>
          <p className="text-xs text-slate-500">
            Obrigatório para o planeamento PCP (coluna Prazo Vendas).
          </p>
          <BrDateInput
            id="so-expected-delivery"
            value={expectedDelivery || null}
            onChange={(iso) => onExpectedDeliveryChange(iso ?? "")}
            disabled={disabled}
            className="max-w-xs"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Condições de pagamento</Label>
          <PaymentTermsFields
            idPrefix="so-form"
            paymentInstallments={paymentInstallments}
            onPaymentInstallmentsChange={onPaymentInstallmentsChange}
            paymentDaysFirst={paymentDaysFirst}
            onPaymentDaysFirstChange={onPaymentDaysFirstChange}
            paymentDaysBetween={paymentDaysBetween}
            onPaymentDaysBetweenChange={onPaymentDaysBetweenChange}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
