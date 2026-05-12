import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface QuoteHeaderFormProps {
  quoteNumber: string;
  onQuoteNumberChange: (value: string) => void;
  clientName: string;
  onClientNameChange: (value: string) => void;
  clientDocument: string;
  onClientDocumentChange: (value: string) => void;
  clientEmail: string;
  onClientEmailChange: (value: string) => void;
  clientPhone: string;
  onClientPhoneChange: (value: string) => void;
  quoteDate: string;
  onQuoteDateChange: (value: string) => void;
  validUntil: string;
  onValidUntilChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}

/**
 * Campos do cabeçalho do orçamento (reutilizável na edição futura).
 */
export function QuoteFormFields({
  quoteNumber,
  onQuoteNumberChange,
  clientName,
  onClientNameChange,
  clientDocument,
  onClientDocumentChange,
  clientEmail,
  onClientEmailChange,
  clientPhone,
  onClientPhoneChange,
  quoteDate,
  onQuoteDateChange,
  validUntil,
  onValidUntilChange,
  notes,
  onNotesChange,
}: QuoteHeaderFormProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-number">Número do orçamento *</Label>
          <Input
            id="quote-number"
            value={quoteNumber}
            onChange={(e) => onQuoteNumberChange(e.target.value)}
            placeholder="ORC-2026-0001"
            required
            autoComplete="off"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-client-name">Cliente *</Label>
          <Input
            id="quote-client-name"
            value={clientName}
            onChange={(e) => onClientNameChange(e.target.value)}
            placeholder="Nome ou razão social"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-client-document">Documento do cliente</Label>
          <Input
            id="quote-client-document"
            value={clientDocument}
            onChange={(e) => onClientDocumentChange(e.target.value)}
            placeholder="CPF, CNPJ…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-client-email">E-mail</Label>
          <Input
            id="quote-client-email"
            type="email"
            value={clientEmail}
            onChange={(e) => onClientEmailChange(e.target.value)}
            placeholder="email@exemplo.pt"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-client-phone">Telefone</Label>
          <Input
            id="quote-client-phone"
            type="tel"
            value={clientPhone}
            onChange={(e) => onClientPhoneChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-date">Data do orçamento *</Label>
          <Input
            id="quote-date"
            type="date"
            value={quoteDate}
            onChange={(e) => onQuoteDateChange(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-valid-until">Validade *</Label>
          <Input
            id="quote-valid-until"
            type="date"
            value={validUntil}
            onChange={(e) => onValidUntilChange(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="quote-notes">Observações</Label>
          <Textarea
            id="quote-notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={4}
            placeholder="Notas internas ou condições que apareçam junto ao orçamento…"
            className="resize-y min-h-[88px]"
          />
        </div>
      </div>
    </div>
  );
}
