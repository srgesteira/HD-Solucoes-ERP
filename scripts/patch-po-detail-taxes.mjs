import fs from "fs";

const p = "src/app/(app)/purchasing/orders/[id]/page.tsx";
let s = fs.readFileSync(p, "utf8");
const d = "div";

const impostosBlock = `            <${d}>
              <dt className="text-slate-500">Impostos</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.tax)}
              </dd>
            </${d}>`;

const taxBlocks = `            <${d}>
              <dt className="text-slate-500">ICMS</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.total_icms ?? 0)}
              </dd>
            </${d}>
            <${d}>
              <dt className="text-slate-500">IPI</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.total_ipi ?? 0)}
              </dd>
            </${d}>
            <${d}>
              <dt className="text-slate-500">Outros impostos</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {formatCurrency(order.tax)}
              </dd>
            </${d}>`;

if (!s.includes(impostosBlock)) {
  console.error("Impostos block not found");
  process.exit(1);
}
s = s.replace(impostosBlock, taxBlocks);

s = s.replace(
  `                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Total linha
                  </th>
                </tr>`,
  `                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    % ICMS
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    ICMS
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    % IPI
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    IPI
                  </th>
                  <th className="px-3 py-2.5 font-medium text-slate-700 text-right">
                    Total linha
                  </th>
                </tr>`
);

s = s.replace("colSpan={6}", "colSpan={10}");
s = s.replace("min-w-[760px]", "min-w-[1000px]");

const lineTotalCell = `                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                          {formatCurrency(line.total_price)}
                        </td>`;

const taxCells = `                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {line.icms_rate ?? 0}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(line.icms_amount ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {line.ipi_rate ?? 0}%
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">
                          {formatCurrency(line.ipi_amount ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                          {formatCurrency(line.total_price)}
                        </td>`;

if (!s.includes(lineTotalCell)) {
  console.error("line total cell not found");
  process.exit(1);
}
s = s.replace(lineTotalCell, taxCells);

fs.writeFileSync(p, s);
console.log("patched", p);
