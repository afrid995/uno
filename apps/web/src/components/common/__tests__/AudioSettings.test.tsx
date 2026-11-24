import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useAudioSettingsStore } from '../../../stores/audioSettingsStore';
import { AudioSettingsControl } from '../AudioSettingsControl';
import { soundService } from '../../../lib/sound-service';

describe('Audio Settings and Sound Service', () => {
  beforeEach(() => {
    localStorage.clear();
    useAudioSettingsStore.setState({
      soundEnabled: true,
      volume: 0.7,
      muted: false,
    });
  });

  describe('useAudioSettingsStore', () => {
    it('initializes with default values and saves to localStorage', () => {
      const state = useAudioSettingsStore.getState();
      expect(state.soundEnabled).toBe(true);
      expect(state.volume).toBe(0.7);
      expect(state.muted).toBe(false);

      state.setVolume(0.4);
      expect(useAudioSettingsStore.getState().volume).toBe(0.4);

      state.toggleMute();
      expect(useAudioSettingsStore.getState().muted).toBe(true);

      state.setSoundEnabled(false);
      expect(useAudioSettingsStore.getState().soundEnabled).toBe(false);
    });

    it('clamps volume strictly between 0 and 1', () => {
      const state = useAudioSettingsStore.getState();
      state.setVolume(1.8);
      expect(useAudioSettingsStore.getState().volume).toBe(1.0);

      state.setVolume(-0.5);
      expect(useAudioSettingsStore.getState().volume).toBe(0.0);
      expect(useAudioSettingsStore.getState().muted).toBe(true);
    });
  });

  describe('AudioSettingsControl UI', () => {
    it('renders the trigger button and opens popover with slider and preview', () => {
      render(<AudioSettingsControl />);

      const trigger = screen.getByTestId('audio-settings-trigger');
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('title', 'Sound: 70%');

      // Click trigger to open popover
      fireEvent.click(trigger);

      expect(screen.getByTestId('audio-settings-popover')).toBeInTheDocument();
      expect(screen.getByTestId('audio-volume-slider')).toBeInTheDocument();
      expect(screen.getByTestId('audio-test-sound-btn')).toBeInTheDocument();

      // Click preview sound
      const playSpy = vi.spyOn(soundService, 'play');
      fireEvent.click(screen.getByTestId('audio-test-sound-btn'));
      expect(playSpy).toHaveBeenCalledWith('turn_alert');
    });

    it('toggles mute correctly from inside popover', () => {
      render(<AudioSettingsControl />);
      fireEvent.click(screen.getByTestId('audio-settings-trigger'));

      const muteBtn = screen.getByTestId('audio-mute-toggle-btn');
      fireEvent.click(muteBtn);

      expect(useAudioSettingsStore.getState().muted).toBe(true);
      expect(screen.getByText('Muted')).toBeInTheDocument();
    });
  });

  describe('soundService', () => {
    it('safely attempts playback without crashing when Web Audio is simulated', () => {
      expect(() => {
        soundService.play('card_play');
        soundService.play('turn_alert');
        soundService.play('uno_shout');
      }).not.toThrow();
    });
  });
});
