import { useAudioSettingsStore } from '../stores/audioSettingsStore';

export type SoundEffectType =
  | 'card_select'
  | 'card_play'
  | 'card_draw'
  | 'turn_alert'
  | 'skip'
  | 'reverse'
  | 'wild_color'
  | 'draw_penalty'
  | 'uno_shout'
  | 'round_win'
  | 'match_win'
  | 'attack_launch';

class SoundService {
  private ctx: AudioContext | null = null;
  private isUnlocked = false;
  private lastPlayedTimestamps: Map<string, number> = new Map();

  constructor() {
    this.initUnlockListeners();
  }

  private initUnlockListeners() {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          try {
            this.ctx = new AudioCtx();
          } catch {
            // Web Audio unsupported
          }
        }
      }

      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      this.isUnlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  private getEffectiveVolume(): number {
    const { soundEnabled, volume, muted } = useAudioSettingsStore.getState();
    if (!soundEnabled || muted || volume <= 0) return 0;
    return Math.max(0, Math.min(1, volume));
  }

  public play(type: SoundEffectType, options?: { volumeMultiplier?: number }) {
    if (typeof window === 'undefined') return;

    const masterVolume = this.getEffectiveVolume();
    if (masterVolume <= 0) return;

    // Rate limiting: prevent sound bursts (e.g. rapid multiple draws or reconnects)
    const now = Date.now();
    const lastPlayed = this.lastPlayedTimestamps.get(type) || 0;
    const cooldown = type === 'card_draw' ? 45 : 70;
    if (now - lastPlayed < cooldown) return;
    this.lastPlayedTimestamps.set(type, now);

    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      const mult = options?.volumeMultiplier ?? 1;
      const vol = masterVolume * mult * 0.35; // Calibrated safe headroom

      switch (type) {
        case 'card_select':
          this.synthesizeClick(vol);
          break;
        case 'card_play':
          this.synthesizeCardPlay(vol);
          break;
        case 'card_draw':
          this.synthesizeCardDraw(vol);
          break;
        case 'turn_alert':
          this.synthesizeTurnChime(vol);
          break;
        case 'skip':
          this.synthesizeSkip(vol);
          break;
        case 'reverse':
          this.synthesizeReverse(vol);
          break;
        case 'wild_color':
          this.synthesizeWildColor(vol);
          break;
        case 'draw_penalty':
          this.synthesizeDrawPenalty(vol);
          break;
        case 'uno_shout':
          this.synthesizeUnoShout(vol);
          break;
        case 'round_win':
          this.synthesizeRoundWin(vol);
          break;
        case 'match_win':
          this.synthesizeMatchWin(vol);
          break;
        case 'attack_launch':
          this.synthesizeAttackLaunch(vol);
          break;
      }
    } catch {
      // Audio playback fails silently without disrupting gameplay
    }
  }

  // --- Audio Synthesis Implementations ---

  private synthesizeClick(vol: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.03);

    gain.gain.setValueAtTime(vol * 0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  private synthesizeCardPlay(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;

    // Filtered noise for paper texture
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t0);
    filter.Q.setValueAtTime(1.5, t0);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.7, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    // Subtle table-felt thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.07);

    oscGain.gain.setValueAtTime(vol * 0.5, t0);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    whiteNoise.start(t0);
    osc.start(t0);
    osc.stop(t0 + 0.07);
  }

  private synthesizeCardDraw(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.07);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t0);
    filter.frequency.exponentialRampToValueAtTime(600, t0 + 0.07);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t0);
  }

  private synthesizeTurnChime(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;

    // Warm brass bell tone (harmonic 659.25Hz E5 and 987.77Hz B5)
    [659.25, 987.77].forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + idx * 0.05);

      gain.gain.setValueAtTime(vol * (idx === 0 ? 0.6 : 0.4), t0 + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.05 + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t0 + idx * 0.05);
      osc.stop(t0 + idx * 0.05 + 0.23);
    });
  }

  private synthesizeSkip(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, t0);
    osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);

    gain.gain.setValueAtTime(vol * 0.6, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t0);
    osc.stop(t0 + 0.13);
  }

  private synthesizeReverse(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [440, 554.37].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + i * 0.06);

      gain.gain.setValueAtTime(vol * 0.5, t0 + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.06 + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t0 + i * 0.06);
      osc.stop(t0 + i * 0.06 + 0.13);
    });
  }

  private synthesizeWildColor(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, t0); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, t0 + 0.14); // G5

    gain.gain.setValueAtTime(vol * 0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t0);
    osc.stop(t0 + 0.17);
  }

  private synthesizeDrawPenalty(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [140, 110].forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, t0 + idx * 0.08);

      gain.gain.setValueAtTime(vol * 0.4, t0 + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.08 + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t0 + idx * 0.08);
      osc.stop(t0 + idx * 0.08 + 0.11);
    });
  }

  private synthesizeUnoShout(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    // Punchy brass chord (F4, A4, C5)
    [349.23, 440.0, 523.25].forEach((freq) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);

      gain.gain.setValueAtTime(vol * 0.5, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t0);
      osc.stop(t0 + 0.23);
    });
  }

  private synthesizeRoundWin(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    // Major triad chord arpeggio
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + i * 0.06);

      gain.gain.setValueAtTime(vol * 0.45, t0 + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t0 + i * 0.06);
      osc.stop(t0 + i * 0.06 + 0.36);
    });
  }

  private synthesizeMatchWin(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    // Triumphant fanfare
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0 + i * 0.08);

      gain.gain.setValueAtTime(vol * 0.5, t0 + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.08 + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t0 + i * 0.08);
      osc.stop(t0 + i * 0.08 + 0.46);
    });
  }

  private synthesizeAttackLaunch(vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(250, t0);
    osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.15);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, t0);

    gain.gain.setValueAtTime(vol * 0.6, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t0);
    osc.stop(t0 + 0.16);
  }
}

export const soundService = new SoundService();
