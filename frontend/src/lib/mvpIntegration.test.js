import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateMvp } from './mvpIntegration.js';
const calculation = { variants: [{cost: 100000}, {cost: 130000}], as_is_value: 600000, after_value: 800000 };
test('selected part price reaches downstream scenario cost', () => {
 const x = integrateMvp(calculation, {variants:[{amounts:{total:95000}},{amounts:{total:120000}}]}, null, 1);
 assert.equal(x.variants[1].cost,120000); assert.equal(x.mvp_repair_cost,120000);
});
test('valid market estimates replace original demo prices', () => {
 const x=integrateMvp(calculation,null,{as_is:{estimate:710000},after_repair:{estimate:910000}},0);
 assert.equal(x.as_is_value,710000); assert.equal(x.after_value,910000); assert.equal(x.mvp_source,'local_demo_listings');
});
test('insufficient market listings retain original prices', () => {
 const x=integrateMvp(calculation,null,{as_is:null,after_repair:null},0);
 assert.equal(x.as_is_value,600000); assert.equal(x.mvp_source,'original_demo_engine');
});
test('does not mutate original calculation', () => {
 const x=integrateMvp(calculation,{variants:[{amounts:{total:1}}]},null,0);
 assert.equal(calculation.variants[0].cost,100000); assert.equal(x.variants[0].cost,1);
});
