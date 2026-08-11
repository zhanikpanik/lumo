/**
 * Money utilities — conversion and formatting.
 * All amounts internally are in TIYIN (1 som = 100 tiyin).
 */
import { somToTiyin, tiyinToSom, formatTiyin, formatTiyinNumber } from '../utils/money';

describe('somToTiyin', () => {
  it('converts som to tiyin', () => {
    expect(somToTiyin(1)).toBe(100);
    expect(somToTiyin(12.5)).toBe(1250);
    expect(somToTiyin(0)).toBe(0);
  });

  it('rounds floating point correctly', () => {
    // 1.005 * 100 = 100.4999... due to IEEE 754, rounds to 100
    expect(somToTiyin(1.005)).toBe(100);
    expect(somToTiyin(1.006)).toBe(101);
    expect(somToTiyin(1.004)).toBe(100);
  });

  it('handles null/undefined/NaN as zero', () => {
    expect(somToTiyin(null)).toBe(0);
    expect(somToTiyin(undefined)).toBe(0);
    expect(somToTiyin(NaN)).toBe(0);
  });
});

describe('tiyinToSom', () => {
  it('converts tiyin to som', () => {
    expect(tiyinToSom(100)).toBe(1);
    expect(tiyinToSom(1250)).toBe(12.5);
    expect(tiyinToSom(0)).toBe(0);
  });
});

describe('formatTiyin', () => {
  it('formats whole som with space separator', () => {
    expect(formatTiyin(100)).toBe('1');
    expect(formatTiyin(123400)).toBe('1 234');
    expect(formatTiyin(1000000)).toBe('10 000');
  });

  it('formats zero', () => {
    expect(formatTiyin(0)).toBe('0');
  });
});

describe('formatTiyinNumber', () => {
  it('formats number without currency symbol', () => {
    expect(formatTiyinNumber(100)).toBe('1');
    expect(formatTiyinNumber(123400)).toBe('1 234');
  });
});
