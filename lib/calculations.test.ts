import { describe, it, expect } from 'vitest';
import { COUNTRIES, calculatePrice } from '@/lib/geo';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';

describe('continuationPriceFromResolvedCount', () => {
  it('retourne le tarif de base pour 0 beef résolu', () => {
    expect(continuationPriceFromResolvedCount(0)).toBe(5);
  });

  it('ajoute 2 pts par beef résolu, plafonné à 150', () => {
    expect(continuationPriceFromResolvedCount(10)).toBe(5 + 10 * 2);
    expect(continuationPriceFromResolvedCount(100)).toBe(150);
  });

  it('ignore les décimales et les valeurs négatives', () => {
    expect(continuationPriceFromResolvedCount(3.7)).toBe(5 + 3 * 2);
    expect(continuationPriceFromResolvedCount(-5)).toBe(5);
  });
});

describe('calculatePrice (géolocalisation / packs)', () => {
  it('France : prix EUR = base × multiplicateur × taux (1 × 1 × 1)', () => {
    const r = calculatePrice(9.99, COUNTRIES.FR);
    expect(r.currency).toBe('EUR');
    expect(r.amount).toBe(9.99);
  });

  it('Sénégal : ajustement pouvoir d’achat + conversion XOF', () => {
    const r = calculatePrice(9.99, COUNTRIES.SN);
    expect(r.currency).toBe('XOF');
    const expected = Math.round(9.99 * 0.35 * 655.957 * 100) / 100;
    expect(r.amount).toBe(expected);
  });
});
