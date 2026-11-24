import { create } from 'zustand';

export interface AudioSettingsState {
  soundEnabled: boolean;
  volume: number; // 0.0 to 1.0
  muted: boolean;

  setSoundEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

const STORAGE_KEY = 'uno_ultimate_audio_settings';

interface StoredAudioSettings {
  soundEnabled?: boolean;
  volume?: number;
  muted?: boolean;
}

function loadInitialSettings(): { soundEnabled: boolean; volume: number; muted: boolean } {
  const defaults = { soundEnabled: true, volume: 0.7, muted: false };
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
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: { soundEnabled: boolean; volume: number; muted: boolean }) {
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
      });
    },

    setVolume: (volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      set({ volume: clamped, muted: clamped === 0 ? true : get().muted });
      saveSettings({
        soundEnabled: get().soundEnabled,
        volume: clamped,
        muted: clamped === 0 ? true : get().muted,
      });
    },

    toggleMute: () => {
      const nextMuted = !get().muted;
      set({ muted: nextMuted });
      saveSettings({
        soundEnabled: get().soundEnabled,
        volume: get().volume,
        muted: nextMuted,
      });
    },
  };
});
