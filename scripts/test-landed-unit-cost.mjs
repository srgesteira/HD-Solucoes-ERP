/**
 * Testes da fórmula de custo pousado (espelha landed-unit-cost.ts).
 * Uso: node scripts/test-landed-unit-cost.mjs
 */
import assert from "node:assert/strict";

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function roundUnitCost(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

function extrasTotal(order) {
  return (
    num(order.freight_cost) +
    num(order.insurance_cost) +
    num(order.other_costs) +
    num(order.total_tax_non_creditable)
  );
}

function landedUnit(line, orderSubtotal, orderExtras) {
  const subtotal = num(orderSubtotal);
  const extras = extrasTotal(orderExtras);
  let share = 0;
  if (subtotal > 0 && extras > 0) {
    share = roundUnitCost((num(line.totalPrice) / subtotal) * extras);
  }
  const lineTotal = roundUnitCost(num(line.totalPrice) + num(line.ipiValue) + share);
  const qty = num(line.quantity);
  if (qty <= 0) return 0;
  return roundUnitCost(lineTotal / qty);
}

const mp1002 = { quantity: 92.049, totalPrice: 666.4348, ipiValue: 21.66 };
const orderSubtotal = 3046.95;
const noExtras = {
  freight_cost: 0,
  insurance_cost: 0,
  other_costs: 0,
  total_tax_non_creditable: 0,
};

const unit = landedUnit(mp1002, orderSubtotal, noExtras);
assert.ok(Math.abs(unit - 7.4753) < 0.0001, `MP-A10-002: esperado ~7.4753, obteve ${unit}`);

const unitFrete = landedUnit(mp1002, orderSubtotal, { freight_cost: 100 });
const share = (666.4348 / orderSubtotal) * 100;
const expectedFrete = roundUnitCost((666.4348 + 21.66 + share) / 92.049);
assert.equal(unitFrete, expectedFrete);

console.log("OK — landed-unit-cost (MP-A10-002 ≈ 7,4753/kg sem frete)");
