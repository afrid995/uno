import { describe, it, expect } from 'vitest';
import { VariantRegistry } from '../src/variants/variant.types';
import '../src/variants/classic/classic.adapter';
import '../src/variants/flip/flip.adapter';

describe('Variant Architecture & Registry', () => {
  it('registers and resolves Classic UNO and UNO Flip adapters', () => {
    expect(VariantRegistry.has('classic')).toBe(true);
    expect(VariantRegistry.has('uno_flip')).toBe(true);
    expect(VariantRegistry.has('show_em_no_mercy')).toBe(false);

    const variants = VariantRegistry.list();
    const ids = variants.map((v) => v.id);
    expect(ids).toContain('classic');
    expect(ids).toContain('uno_flip');
  });

  it('retrieves variant adapters by identifier', () => {
    const classic = VariantRegistry.get('classic');
    expect(classic.id).toBe('classic');
    expect(classic.name).toBe('Classic UNO');

    const flip = VariantRegistry.get('uno_flip');
    expect(flip.id).toBe('uno_flip');
    expect(flip.name).toBe('UNO Flip');
  });

  it('throws an informative error for unregistered variants', () => {
    expect(() => VariantRegistry.get('invalid_variant' as any)).toThrow(
      'Variant "invalid_variant" is not registered.'
    );
  });

  it('isolates rules between Classic and Flip adapters', () => {
    const classic = VariantRegistry.get('classic');
    const flip = VariantRegistry.get('uno_flip');

    // Both implement the GameVariantAdapter contract
    expect(typeof classic.createGame).toBe('function');
    expect(typeof classic.validateMove).toBe('function');
    expect(typeof classic.processAction).toBe('function');
    expect(typeof classic.startNextRound).toBe('function');

    expect(typeof flip.createGame).toBe('function');
    expect(typeof flip.validateMove).toBe('function');
    expect(typeof flip.processAction).toBe('function');
    expect(typeof flip.startNextRound).toBe('function');
  });
});
