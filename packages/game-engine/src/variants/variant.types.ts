import { Card } from '../cards/card.types';

export interface UnoVariant {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly cardsPerHand: number;
  readonly createDeck: () => Card[];
  readonly calculateScore: (loserHands: readonly (readonly Card[])[]) => number;
}

export class VariantRegistry {
  private static variants = new Map<string, UnoVariant>();

  static register(variant: UnoVariant): void {
    this.variants.set(variant.id, variant);
  }

  static get(id: string): UnoVariant {
    const variant = this.variants.get(id);
    if (!variant) {
      throw new Error(`Variant "${id}" is not registered.`);
    }
    return variant;
  }

  static list(): readonly UnoVariant[] {
    return Array.from(this.variants.values());
  }

  static has(id: string): boolean {
    return this.variants.has(id);
  }
}
