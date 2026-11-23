import React from 'react';
import { User, LogOut } from 'lucide-react';
import { useGuestStore } from '../../stores/guestStore';

export const Header: React.FC = () => {
  const { guest, logout } = useGuestStore();

  return (
    <header className="w-full border-b border-white/[0.08] bg-[#0c1017]/95 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        {/* Brand Logo & Wordmark */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#d9383a] border border-white/20 shadow-sm text-white font-display font-bold text-base sm:text-lg select-none">
            U
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-bold text-base sm:text-lg tracking-wider text-white">
                UNO <span className="text-amber-400 font-semibold">ULTIMATE</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium tracking-normal hidden sm:block">
              Private Multiplayer Card Table
            </p>
          </div>
        </div>

        {/* Guest Session Status */}
        <div className="flex items-center gap-3">
          {guest ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-card border border-white/[0.08] text-xs text-slate-200">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium text-white">{guest.username}</span>
                <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                  #{guest.id.substring(0, 6)}
                </span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/[0.08] hover:bg-surface-elevated transition-colors cursor-pointer"
                title="Switch Guest or Logout"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Guest Sessions • Server Authoritative</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
