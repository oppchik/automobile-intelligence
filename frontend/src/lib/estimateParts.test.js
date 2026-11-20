import test from 'node:test';
import assert from 'node:assert/strict';
import { applySelectedParts } from './estimateParts.js';
const estimate = { contingency_rate: 0.1, variants: [{ key: 'dealer', parts: [{ name: 'Капот', amount: 10000, base_price: 10000, condition: 'new' }], amounts: { parts: 10000, labor: 5000, diagnostic: 1000, contingency: 1500, total: 17500 } }] };
test('matched offer replaces cost, not adds twice', () => {
 const result = applySelectedParts(estimate, [{ key: '1', name: 'капот', price: 8000, quantity: 1, condition: 'used' }]);
 assert.equal(result.estimate.variants[0].amounts.total, 15300);
 assert.equal(result.replacements.length, 1);
 assert.equal(estimate.variants[0].amounts.total, 17500);
});
test('unmatched offer is not counted', () => {
 const result = applySelectedParts(estimate, [{ key: '2', name: 'Фара', price: 5000 }]);
 assert.equal(result.estimate.variants[0].amounts.total, 17500);
 assert.equal(result.unmatched.length, 1);
});
