import assert from 'node:assert/strict';
import test from 'node:test';
import { unitConversionFactor, computeLineCostTiyin } from '../recipeCost.js';

// ── unitConversionFactor ──────────────────────────────────

test('converts g→g as identity', () => {
  assert.equal(unitConversionFactor('g', 'g'), 1);
});

test('converts g→kg as 0.001', () => {
  assert.equal(unitConversionFactor('g', 'kg'), 0.001);
});

test('converts kg→g as 1000', () => {
  assert.equal(unitConversionFactor('kg', 'g'), 1000);
});

test('converts ml→l as 0.001', () => {
  assert.equal(unitConversionFactor('ml', 'l'), 0.001);
});

test('converts l→ml as 1000', () => {
  assert.equal(unitConversionFactor('l', 'ml'), 1000);
});

test('converts unit→unit as identity', () => {
  assert.equal(unitConversionFactor('unit', 'unit'), 1);
});

test('normalizes case and whitespace', () => {
  assert.equal(unitConversionFactor(' KG ', 'G'), 1000);
  assert.equal(unitConversionFactor('ML', ' L '), 0.001);
});

test('throws on unsupported cross-type conversion', () => {
  assert.throws(() => unitConversionFactor('g', 'ml'), /Unsupported/);
  assert.throws(() => unitConversionFactor('g', 'unit'), /Unsupported/);
  assert.throws(() => unitConversionFactor('ml', 'kg'), /Unsupported/);
});

test('throws on unknown unit', () => {
  assert.throws(() => unitConversionFactor('oz', 'g'), /Unsupported/);
});

// ── computeLineCostTiyin ──────────────────────────────────

test('same-unit cost: 500g at 200 tiyin/g = 100 tiyin', () => {
  // 500 milli-g / 1000 = 0.5g, 0.5 × 200 = 100
  assert.equal(computeLineCostTiyin(500, 'g', 'g', 200), 100);
});

test('full-unit cost: 1000g at 200 tiyin/g = 200 tiyin', () => {
  assert.equal(computeLineCostTiyin(1000, 'g', 'g', 200), 200);
});

test('cross-unit cost: 500g of ingredient priced per kg', () => {
  // 500 milli-g = 0.5g, 0.5g → 0.0005kg, 0.0005 × 50000 = 25
  assert.equal(computeLineCostTiyin(500, 'g', 'kg', 50000), 25);
});

test('large recipe: 18000 milli-g (18g) at 50000 tiyin/kg', () => {
  // 18g → 0.018kg, 0.018 × 50000 = 900
  assert.equal(computeLineCostTiyin(18000, 'g', 'kg', 50000), 900);
});

test('volume cost: 200000 milli-ml (200ml) at 8000 tiyin/l', () => {
  // 200ml → 0.2l, 0.2 × 8000 = 1600
  assert.equal(computeLineCostTiyin(200000, 'ml', 'l', 8000), 1600);
});

test('unit (piece) cost: 1 piece at 15000 tiyin', () => {
  assert.equal(computeLineCostTiyin(1000, 'unit', 'unit', 15000), 15000);
});

test('rounds to nearest integer', () => {
  // 1500 milli-g at 333 tiyin/g = 1.5 × 333 = 499.5 → 500
  assert.equal(computeLineCostTiyin(1500, 'g', 'g', 333), 500);
});

test('throws on non-positive quantityMilli', () => {
  assert.throws(() => computeLineCostTiyin(0, 'g', 'g', 100), /positive safe integer/);
  assert.throws(() => computeLineCostTiyin(-100, 'g', 'g', 100), /positive safe integer/);
});

test('throws on non-integer quantityMilli', () => {
  assert.throws(() => computeLineCostTiyin(1.5, 'g', 'g', 100), /positive safe integer/);
});

test('throws on negative ingredientUnitCostTiyin', () => {
  assert.throws(() => computeLineCostTiyin(1000, 'g', 'g', -100), /non-negative safe integer/);
});

test('allows zero ingredientUnitCostTiyin (free ingredient)', () => {
  assert.equal(computeLineCostTiyin(1000, 'g', 'g', 0), 0);
});
