export type ParsedBankLine = {
  date: string;
  amount: number;
  description: string | null;
  documentNumber: string | null;
};

function parseOfxDate(raw: string): string | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseOfxAmount(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/** Parser OFX 1.x/2.x — extrai STMTTRN do XML/SGML. */
export function parseOfxBankLines(content: string): ParsedBankLine[] {
  const out: ParsedBankLine[] = [];
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  for (const block of blocks) {
    const dtPosted =
      block.match(/<DTPOSTED>([^<\n]+)/i)?.[1] ??
      block.match(/DTPOSTED>([^\n<]+)/i)?.[1];
    const trnAmt =
      block.match(/<TRNAMT>([^<\n]+)/i)?.[1] ??
      block.match(/TRNAMT>([^\n<]+)/i)?.[1];
    if (!dtPosted || trnAmt == null) continue;

    const date = parseOfxDate(dtPosted.trim());
    const amount = parseOfxAmount(trnAmt);
    if (!date || amount == null) continue;

    const memo =
      block.match(/<MEMO>([^<\n]+)/i)?.[1]?.trim() ??
      block.match(/MEMO>([^\n<]+)/i)?.[1]?.trim() ??
      null;
    const name =
      block.match(/<NAME>([^<\n]+)/i)?.[1]?.trim() ??
      block.match(/NAME>([^\n<]+)/i)?.[1]?.trim() ??
      null;
    const fitId =
      block.match(/<FITID>([^<\n]+)/i)?.[1]?.trim() ??
      block.match(/FITID>([^\n<]+)/i)?.[1]?.trim() ??
      null;

    out.push({
      date,
      amount,
      description: memo || name,
      documentNumber: fitId,
    });
  }

  return out;
}

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
