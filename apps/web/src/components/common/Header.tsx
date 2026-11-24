import React from 'react';
import { User, LogOut, Shield, ChevronDown } from 'lucide-react';
import { useGuestStore } from '../../stores/guestStore';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { AudioSettingsControl } from './AudioSettingsControl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
        <div className="flex items-center gap-2 sm:gap-3">
          <AudioSettingsControl />
          {guest ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141924] border-white/[0.08] text-xs text-slate-200 hover:bg-[#1a202d]"
                  >
                    <Avatar className="h-5 w-5 rounded-full border border-amber-400/40">
                      <AvatarFallback className="text-[10px] bg-slate-800 text-amber-300 font-bold">
                        {guest.username.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-white">{guest.username}</span>
                    <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                      #{guest.id.substring(0, 6)}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-[#121620] border-white/10">
                  <DropdownMenuLabel className="font-mono text-[11px] text-slate-400">
                    ID: {guest.id}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-rose-400 focus:text-rose-300 focus:bg-rose-950/40 gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Switch Guest / Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/[0.08] hover:bg-[#1a202d]"
                title="Switch Guest or Logout"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
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
