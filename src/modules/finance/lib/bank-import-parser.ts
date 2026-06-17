export type ParsedBankLine = {
  date: string;
  amount: number;
  description: string | null;
  documentNumber: string | null;
};

/** Parser CSV simples: data;valor;descrição ou data,valor,descrição */
export function parseCsvBankLines(content: string): ParsedBankLine[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ParsedBankLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && /data|date|valor|amount/i.test(line)) continue;

    const parts = line.includes(";") ? line.split(";") : line.split(",");
    if (parts.length < 2) continue;

    const dateRaw = parts[0]!.trim();
    const amountRaw = parts[1]!.replace(/\./g, "").replace(",", ".").trim();
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) continue;

    let iso = dateRaw;
    const br = dateRaw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (br) {
      let y = br[3]!;
      if (y.length === 2) y = `20${y}`;
      iso = `${y}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
    }

    out.push({
      date: iso.slice(0, 10),
      amount,
      description: parts[2]?.trim() || null,
      documentNumber: parts[3]?.trim() || null,
    });
  }
  return out;
}
