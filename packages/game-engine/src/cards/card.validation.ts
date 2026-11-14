import { z } from 'zod';
import { Card, CardColor } from './card.types';

export const cardColorSchema = z.enum([
  'red',
  'yellow',
  'green',
  'blue',
  'pink',
  'teal',
  'orange',
  'purple',
]);

export const numberCardValueSchema = z.enum([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
]);

export const actionCardValueSchema = z.enum([
  'skip',
  'reverse',
  'draw_two',
  'draw_one',
  'draw_five',
  'skip_everyone',
  'flip',
  'draw_four',
  'discard_all',
]);

export const wildCardValueSchema = z.enum([
  'wild',
  'wild_draw_four',
  'wild_draw_two',
  'wild_draw_color',
  'wild_reverse_draw_four',
  'wild_draw_six',
  'wild_draw_ten',
  'wild_color_roulette',
  'wild_reverse',
  'wild_skip',
  'wild_skip_two',
  'wild_targeted_draw_two',
  'wild_forced_swap',
]);

export const cardValueSchema = z.union([
  numberCardValueSchema,
  actionCardValueSchema,
  wildCardValueSchema,
]);

export const cardTypeSchema = z.enum(['number', 'action', 'wild']);

export const cardFaceSchema = z.object({
  color: cardColorSchema.nullable(),
  value: cardValueSchema,
  type: cardTypeSchema,
  scoreValue: z.number().int().min(0).max(60),
});

export const cardSchema = z.object({
  id: z.string().min(1),
  color: cardColorSchema.nullable(),
  value: cardValueSchema,
  type: cardTypeSchema,
  scoreValue: z.number().int().min(0).max(60),
  variant: z.string().min(1),
  lightFace: cardFaceSchema.optional(),
  darkFace: cardFaceSchema.optional(),
  currentSide: z.enum(['LIGHT', 'DARK']).optional(),
});

export function isCard(candidate: unknown): candidate is Card {
  return cardSchema.safeParse(candidate).success;
}

export function isColor(candidate: unknown): candidate is CardColor {
  return cardColorSchema.safeParse(candidate).success;
}

export function isNumberCard(card: Card): boolean {
  return card.type === 'number';
}

export function isActionCard(card: Card): boolean {
  return card.type === 'action';
}

export function isWildCard(card: Card): boolean {
  return card.type === 'wild';
}
