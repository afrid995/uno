import React from 'react';
import { Shield, User } from 'lucide-react';
import { useGuestStore } from '../../stores/guestStore';

export const Header: React.FC = () => {
  const { guest, logout } = useGuestStore();

  return (
    <header className="w-full border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 via-amber-500 to-blue-500 p-0.5 shadow-lg shadow-red-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <span className="font-display font-black text-xl bg-gradient-to-r from-red-400 via-yellow-300 to-blue-400 bg-clip-text text-transparent">
                U
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-xl tracking-tight text-white">
                UNO <span className="text-uno-red">ULTIMATE</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-uno-red/10 border border-uno-red/30 text-uno-red">
                Phase 1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Private Multiplayer Card Game</p>
          </div>
        </div>

        {/* Right side info or Guest Badge */}
        <div className="flex items-center gap-3">
          {guest ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-200">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-medium text-white">{guest.username}</span>
                <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                  #{guest.id.substring(0, 6)}
                </span>
              </div>
              <button
                onClick={logout}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded hover:bg-slate-800 transition-colors"
                title="Switch Guest or Logout"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Guest Mode • Server Authoritative</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
