import { useAudioSettingsStore } from '../stores/audioSettingsStore';

/**
 * Safe, feature-detected mobile haptic vibration utility for UNO Ultimate.
 * Respects browser capabilities and user preferences.
 */
export type HapticType = 'light' | 'medium' | 'success' | 'warning';

export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof window === 'undefined') return;
  if (!useAudioSettingsStore.getState().hapticsEnabled) return;
  if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') return;

  try {
    switch (type) {
      case 'light':
        // Short subtle tap (10ms)
        navigator.vibrate(10);
        break;
      case 'medium':
        // Distinct event pulse (25ms)
        navigator.vibrate(25);
        break;
      case 'success':
        // Multi-burst confirmation (15ms on, 40ms off, 20ms on)
        navigator.vibrate([15, 40, 20]);
        break;
      case 'warning':
        // Alert vibration pattern
        navigator.vibrate([30, 40, 30]);
        break;
    }
  } catch {
    // Fails silently if vibration is blocked or restricted by platform policy
  }
}
