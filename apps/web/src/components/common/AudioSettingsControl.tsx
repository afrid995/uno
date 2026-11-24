import React from 'react';
import { Volume2, VolumeX, Volume1, Play } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useAudioSettingsStore } from '../../stores/audioSettingsStore';
import { soundService } from '../../lib/sound-service';

export const AudioSettingsControl: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { soundEnabled, volume, muted, setSoundEnabled, setVolume, toggleMute } =
    useAudioSettingsStore();

  const isMuted = !soundEnabled || muted || volume === 0;

  const handleVolumeChange = (values: number[]) => {
    const val = values[0];
    if (typeof val === 'number') {
      setVolume(val / 100);
      if (!soundEnabled) {
        setSoundEnabled(true);
      }
    }
  };

  const handleTestSound = () => {
    soundService.play('turn_alert');
  };

  const volumePercent = Math.round((isMuted ? 0 : volume) * 100);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-testid="audio-settings-trigger"
          variant="ghost"
          size="sm"
          className={`h-8 w-8 sm:h-9 sm:w-9 p-0 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.08] relative ${className}`}
          aria-label={isMuted ? 'Audio settings (Muted)' : `Audio settings (Volume ${volumePercent}%)`}
          title={isMuted ? 'Sound Muted — Click to adjust' : `Sound: ${volumePercent}%`}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-slate-400" />
          ) : volume < 0.5 ? (
            <Volume1 className="w-4 h-4 text-amber-300" />
          ) : (
            <Volume2 className="w-4 h-4 text-amber-400" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 bg-[#121620] border-white/10 p-4 shadow-modal text-slate-100"
        data-testid="audio-settings-popover"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
            <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-300">
              Audio Settings
            </h4>
            <span className="font-mono text-xs font-semibold text-amber-400">
              {isMuted ? 'Muted' : `${volumePercent}%`}
            </span>
          </div>

          {/* Volume Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Sound Effects Volume</span>
              <button
                type="button"
                data-testid="audio-mute-toggle-btn"
                onClick={toggleMute}
                className="text-[11px] text-amber-400/90 hover:text-amber-300 underline font-medium cursor-pointer"
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                data-testid="audio-mute-icon-btn"
                onClick={toggleMute}
                className="text-slate-400 hover:text-white transition-colors"
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                )}
              </button>
              <Slider
                data-testid="audio-volume-slider"
                value={[isMuted ? 0 : Math.round(volume * 100)]}
                max={100}
                min={0}
                step={1}
                onValueChange={handleVolumeChange}
                aria-label="Sound effects volume"
                className="flex-1"
              />
            </div>
          </div>

          {/* Controls Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
            <Button
              data-testid="audio-test-sound-btn"
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTestSound}
              disabled={isMuted}
              className="text-xs h-7 px-2.5 rounded-lg bg-[#1a202d] hover:bg-[#232b3d] text-slate-200 border-white/10 flex items-center gap-1.5"
            >
              <Play className="w-3 h-3 text-amber-400" />
              <span>Preview Sound</span>
            </Button>

            <span className="text-[10px] text-slate-400 font-mono">
              Persisted locally
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
