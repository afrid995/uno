import { create } from 'zustand';

export interface AudioSettingsState {
  soundEnabled: boolean;
  volume: number; // 0.0 to 1.0
  muted: boolean;
  hapticsEnabled: boolean;

  setSoundEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setHapticsEnabled: (enabled: boolean) => void;
  toggleHaptics: () => void;
}

const STORAGE_KEY = 'uno_ultimate_audio_settings';

interface StoredAudioSettings {
  soundEnabled?: boolean;
  volume?: number;
  muted?: boolean;
  hapticsEnabled?: boolean;
}

function loadInitialSettings(): { soundEnabled: boolean; volume: number; muted: boolean; hapticsEnabled: boolean } {
  const defaults = { soundEnabled: true, volume: 0.7, muted: false, hapticsEnabled: true };
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: StoredAudioSettings = JSON.parse(raw);
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : defaults.soundEnabled,
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : defaults.volume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : defaults.muted,
      hapticsEnabled: typeof parsed.hapticsEnabled === 'boolean' ? parsed.hapticsEnabled : defaults.hapticsEnabled,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: { soundEnabled: boolean; volume: number; muted: boolean; hapticsEnabled: boolean }) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage quota or privacy restriction
  }
}

export const useAudioSettingsStore = create<AudioSettingsState>((set, get) => {
  const initial = loadInitialSettings();

  return {
    ...initial,

    setSoundEnabled: (enabled: boolean) => {
      set({ soundEnabled: enabled });
      saveSettings({
        soundEnabled: enabled,
        volume: get().volume,
        muted: get().muted,
        hapticsEnabled: get().hapticsEnabled,
      });
    },

    setVolume: (volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      set({ volume: clamped, muted: clamped === 0 ? true : get().muted });
      saveSettings({
        soundEnabled: get().soundEnabled,
        volume: clamped,
        muted: clamped === 0 ? true : get().muted,
        hapticsEnabled: get().hapticsEnabled,
      });
    },

    toggleMute: () => {
      const nextMuted = !get().muted;
      set({ muted: nextMuted });
      saveSettings({
        soundEnabled: get().soundEnabled,
        volume: get().volume,
        muted: nextMuted,
        hapticsEnabled: get().hapticsEnabled,
      });
    },

    setHapticsEnabled: (enabled: boolean) => {
      set({ hapticsEnabled: enabled });
      saveSettings({
        soundEnabled: get().soundEnabled,
        volume: get().volume,
        muted: get().muted,
        hapticsEnabled: enabled,
      });
    },

    toggleHaptics: () => {
      const nextHaptics = !get().hapticsEnabled;
      set({ hapticsEnabled: nextHaptics });
      saveSettings({
        soundEnabled: get().soundEnabled,
        volume: get().volume,
        muted: get().muted,
        hapticsEnabled: nextHaptics,
      });
    },
  };
});
