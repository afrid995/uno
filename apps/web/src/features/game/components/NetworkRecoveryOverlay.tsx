import React from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { socketManager } from '../../../services/socketClient';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export const NetworkRecoveryOverlay: React.FC = () => {
  const connectionStatus = useGameStore((state) => state.connectionStatus);

  if (connectionStatus === 'connected') {
    return null;
  }

  const handleManualRetry = () => {
    const socket = socketManager.getSocket();
    if (!socket.connected) {
      socket.connect();
    }
  };

  return (
    <div
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-auto select-none max-w-sm w-auto mx-auto px-2"
    >
      {connectionStatus === 'reconnecting' && (
        <div
          data-testid="reconnecting-overlay"
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#141924]/95 border border-amber-400/50 text-slate-200 shadow-modal backdrop-blur-md transition-all duration-300"
        >
          <div className="relative flex items-center justify-center shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-amber-300 tracking-wide font-display flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              RECONNECTING TO MATCH...
            </span>
            <span className="text-[10px] text-slate-400 font-mono truncate">
              Restoring network. Hand & seat preserved.
            </span>
          </div>
        </div>
      )}

      {connectionStatus === 'disconnected' && (
        <div
          data-testid="connection-lost-overlay"
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#141924]/95 border border-rose-500/50 text-slate-200 shadow-modal backdrop-blur-md transition-all duration-300"
        >
          <div className="flex items-center justify-center shrink-0 text-rose-400">
            <WifiOff className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-rose-300 tracking-wide font-display">
              CONNECTION LOST
            </span>
            <span className="text-[10px] text-slate-400 font-mono truncate">
              Network dropped. Reconnecting automatically...
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleManualRetry}
            data-testid="reconnect-retry-button"
            className="ml-1 h-7 px-2.5 text-[11px] font-bold rounded-lg bg-[#1a202d] hover:bg-white/[0.08] text-white border-white/[0.12] shrink-0"
          >
            Retry Now
          </Button>
        </div>
      )}

      {connectionStatus === 'reconnected' && (
        <div
          data-testid="reconnected-banner"
          className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#141924]/95 border border-emerald-500/50 text-slate-200 shadow-modal backdrop-blur-md transition-all duration-300"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-emerald-300 tracking-wide font-display flex items-center gap-1">
              <Wifi className="w-3 h-3 text-emerald-400" />
              RECONNECTED
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Match state synchronized.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
