import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xml = readFileSync("tmp-sample-nfe.xml", "utf8");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});
const root = parser.parse(xml);
const inf = root.nfeProc.NFe.infNFe;
const det = Array.isArray(inf.det) ? inf.det[0] : inf.det;
const out = {
  supplier: inf.emit.xNome,
  cnpj: String(inf.emit.CNPJ),
  nNF: String(inf.ide.nNF),
  item: det.prod.xProd,
  qty: det.prod.qCom,
  ch: root.nfeProc.protNFe.infProt.chNFe,
};
console.log(out);
if (out.item !== "Parafuso M8") throw new Error("fail item");
console.log("OK sample structure");
