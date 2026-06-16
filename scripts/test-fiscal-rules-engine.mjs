/**
 * Testes unitários do matcher fiscal.
 * node --experimental-strip-types scripts/test-fiscal-rules-engine.mjs
 */
import assert from "node:assert/strict";
import { resolveFiscalRule } from "../src/modules/fiscal/lib/fiscal-rules-engine.ts";

const baseRule = {
  id: "r1",
  tenant_id: "t1",
  name: "Venda MG",
  description: null,
  priority: 10,
  is_active: true,
  valid_from: null,
  valid_until: null,
  notes: null,
  operation_type: "sale",
  origin_uf: "SP",
  destination_uf: "MG",
  tax_regime_id: null,
  company_tax_regime: null,
  ncm_pattern: null,
  product_prefix_code: null,
  product_nature: null,
  cfop: null,
  icms_rate: null,
  ipi_rate: null,
  icms_st: null,
  icms_st_rate: null,
  pis_rate: null,
  cofins_rate: null,
  cbs_rate: null,
  ibs_rate: null,
  ibs_cbs_classificacao: null,
};

const ctx = {
  operationType: "sale",
  originUf: "SP",
  destinationUf: "MG",
  taxRegimeId: null,
  companyTaxRegime: null,
  ncm: "84213990",
  productPrefixCode: "HD1",
  productNature: null,
};

{
  const r = resolveFiscalRule([], ctx);
  assert.equal(r.fiscalStatus, "no_rules");
  assert.equal(r.rule, null);
}

{
  const r = resolveFiscalRule([baseRule], ctx);
  assert.equal(r.rule?.id, "r1");
  assert.equal(r.matchScore, 3);
  assert.equal(r.fiscalStatus, "review_required");
  assert.equal(r.rates, null);
}

{
  const r = resolveFiscalRule([baseRule], { ...ctx, destinationUf: "RJ" });
  assert.equal(r.fiscalStatus, "no_rules");
}

{
  const rule = {
    ...baseRule,
    id: "r2",
    destination_uf: null,
    origin_uf: null,
    operation_type: null,
    ncm_pattern: "8421%",
    icms_rate: 12,
  };
  const r = resolveFiscalRule([rule], ctx);
  assert.equal(r.rule?.id, "r2");
  assert.equal(r.rates?.icmsRate, 12);
  assert.equal(r.fiscalStatus, "rules_applied");
}

{
  const generic = {
    ...baseRule,
    id: "generic",
    destination_uf: null,
    priority: 1,
    name: "Genérica",
  };
  const specific = { ...baseRule, id: "specific", priority: 50, name: "Específica" };
  const r = resolveFiscalRule([generic, specific], ctx);
  assert.equal(r.rule?.id, "specific");
}

console.log("OK: fiscal-rules-engine tests passed");
