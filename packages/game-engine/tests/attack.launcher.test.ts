import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AttackLauncher } from '../src/variants/attack/attack.launcher';
import { ATTACK_LAUNCHER_CONFIG } from '../src/variants/attack/attack.constants';

describe('AttackLauncher Virtual Card Launcher Mechanics', () => {
  beforeEach(() => {
    AttackLauncher.setDeterministicOverride(null);
  });

  afterEach(() => {
    AttackLauncher.setDeterministicOverride(null);
  });

  it('respects deterministic card override for predictable unit testing', () => {
    AttackLauncher.setDeterministicOverride(3);
    const res = AttackLauncher.evaluatePresses(1, 0, 50);
    expect(res.totalCardsToDispense).toBe(3);
    expect(res.finalTension).toBe(0); // Resets to 0 on launch

    AttackLauncher.setDeterministicOverride(0);
    const zeroRes = AttackLauncher.evaluatePresses(1, 0, 50);
    expect(zeroRes.totalCardsToDispense).toBe(0);
    expect(zeroRes.finalTension).toBe(1); // Builds tension on 0-card press
  });

  it('increases tension on silent presses and caps at MAX_TENSION_LEVEL', () => {
    // Mock RNG that always returns 1.0 (never triggers roll < launchChance)
    const silentRng = () => 1.0;

    let tension = 0;
    for (let i = 1; i <= 6; i++) {
      const res = AttackLauncher.evaluatePresses(1, tension, 50, silentRng);
      expect(res.totalCardsToDispense).toBe(0);
      tension = res.finalTension;
      expect(tension).toBe(Math.min(i, ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL));
    }
    expect(tension).toBe(ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL);
  });

  it('resets tension to 0 when cards are dispensed', () => {
    // Mock RNG: first roll 0.0 (triggers launch), second roll 0.5 (count)
    const launchRng = () => 0.0;
    const res = AttackLauncher.evaluatePresses(1, 3, 50, launchRng);

    expect(res.totalCardsToDispense).toBeGreaterThan(0);
    expect(res.finalTension).toBe(0);
  });

  it('evaluates multi-press sequences (e.g. 2 presses for Hit 2)', () => {
    const silentRng = () => 1.0;
    const res = AttackLauncher.evaluatePresses(2, 0, 50, silentRng);

    expect(res.totalCardsToDispense).toBe(0);
    expect(res.pressResults.length).toBe(2);
    expect(res.finalTension).toBe(2);
  });

  it('evaluates multi-press sequences for Wild Hit 4 (4 presses)', () => {
    const silentRng = () => 1.0;
    const res = AttackLauncher.evaluatePresses(4, 0, 50, silentRng);

    expect(res.totalCardsToDispense).toBe(0);
    expect(res.pressResults.length).toBe(4);
    expect(res.finalTension).toBe(4);
  });

  it('never dispenses more cards than currently available in draw pile', () => {
    AttackLauncher.setDeterministicOverride(10);
    const res = AttackLauncher.evaluatePresses(1, 0, 2); // Only 2 cards in draw pile!
    expect(res.totalCardsToDispense).toBe(2);
  });

  it('respects maximum burst capacity of 12 cards', () => {
    // With max tension and high count roll, burst cannot exceed 12
    const burstRng = () => 0.0;
    const res = AttackLauncher.evaluatePresses(1, 4, 100, burstRng);
    expect(res.totalCardsToDispense).toBeLessThanOrEqual(ATTACK_LAUNCHER_CONFIG.MAX_BURST_CAPACITY);
  });
});
