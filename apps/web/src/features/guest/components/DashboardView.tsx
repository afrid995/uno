import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { PlusCircle, LogIn, Clock, ShieldCheck, Copy, Check } from 'lucide-react';
import { useGuestStore } from '../../../stores/guestStore';
import { CreateRoomModal } from '../../room/components/CreateRoomModal';
import { JoinRoomModal } from '../../room/components/JoinRoomModal';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const DashboardView: React.FC = () => {
  const { guest, logout } = useGuestStore();
  const [copied, setCopied] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  if (!guest) return null;

  const copyGuestId = () => {
    navigator.clipboard.writeText(guest.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedExpiration = new Date(guest.expiresAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });

  const initials = guest.username.slice(0, 2).toUpperCase();

  return (
    <TooltipProvider>
      <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Welcome Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="bg-[#141924] border-white/[0.08] p-6 sm:p-8 rounded-2xl shadow-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge variant="emerald" className="gap-1.5 py-0.5 px-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Guest Session Active
                  </Badge>
                  <span className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Session expires {formattedExpiration}
                  </span>
                </div>

                <div className="flex items-center gap-3.5">
                  <Avatar className="h-12 w-12 border-amber-500/30 bg-slate-800">
                    <AvatarFallback className="font-display font-bold text-amber-300 bg-slate-800/90 text-base">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
                      Welcome, <span className="text-amber-400">{guest.username}</span>
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mt-0.5">
                      Host an official variant or enter a 6-character room code to join friends.
                    </p>
                  </div>
                </div>
              </div>

              {/* Guest Identity Card */}
              <div className="bg-[#10141d] border border-white/[0.06] rounded-xl p-4 w-full sm:w-auto min-w-[220px]">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 block mb-1">
                  Guest Identity ID
                </span>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs font-mono text-amber-300 truncate max-w-[160px]" title={guest.id}>
                    {guest.id}
                  </code>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        onClick={copyGuestId}
                        aria-label="Copy Guest ID"
                        className="h-7 w-7 rounded-lg border-white/[0.08] bg-[#1a202d] hover:bg-[#222a3a]"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copy full Guest ID</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Stored securely in session storage</p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Main Room Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Create Private Room Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="h-full"
          >
            <Card className="h-full flex flex-col justify-between bg-[#141924] border-white/[0.08] hover:border-red-500/30 p-6 sm:p-7 rounded-2xl shadow-card transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
                  <PlusCircle className="w-5 h-5" />
                </div>

                <CardTitle className="font-display font-bold text-xl text-white mb-2">
                  Create Private Room
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Host a match with your preferred UNO variant (Classic, Flip, No Mercy, All Wild, Flex, Teams, or Attack) and share a private invite link.
                </CardDescription>
              </div>

              <div className="mt-8 pt-5 border-t border-white/[0.06]">
                <Button
                  data-testid="create-room-btn"
                  variant="default"
                  size="lg"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="w-full rounded-xl font-display font-bold text-sm tracking-wide text-white bg-red-600 hover:bg-red-500 active:bg-red-700 shadow-sm border border-red-500/30 gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Create Room</span>
                </Button>
                <p className="text-[11px] text-center text-slate-500 mt-2">
                  Generates a private 6-character room code
                </p>
              </div>
            </Card>
          </motion.div>

          {/* Join Room Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="h-full"
          >
            <Card className="h-full flex flex-col justify-between bg-[#141924] border-white/[0.08] hover:border-white/[0.16] p-6 sm:p-7 rounded-2xl shadow-card transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-white/[0.1] flex items-center justify-center text-slate-300 mb-4">
                  <LogIn className="w-5 h-5" />
                </div>

                <CardTitle className="font-display font-bold text-xl text-white mb-2">
                  Join Private Room
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Enter a friend's room code or accept an invitation URL to enter an ongoing waiting lounge.
                </CardDescription>
              </div>

              <div className="mt-8 pt-5 border-t border-white/[0.06]">
                <Button
                  data-testid="join-room-btn"
                  variant="secondary"
                  size="lg"
                  onClick={() => setIsJoinModalOpen(true)}
                  className="w-full rounded-xl font-display font-bold text-sm tracking-wide text-slate-200 hover:text-white bg-[#1a202d] hover:bg-[#222a3a] border border-white/[0.12] gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-slate-300" />
                  <span>Join Room</span>
                </Button>
                <p className="text-[11px] text-center text-slate-500 mt-2">
                  Enter 6-character code or follow invite link
                </p>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Architectural Reliability Callout */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <Card className="p-5 rounded-2xl bg-[#10141d] border-white/[0.06] text-xs text-slate-400 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Server-Authoritative Fair Play Foundation</span>
            </div>
            <p className="leading-relaxed text-slate-400">
              UNO Ultimate runs an authoritative server architecture. The game state, deck shuffling, and card deal order remain strictly concealed on the server. Clients receive only their own private cards and public opponent card counts, rendering card-peeking and client-side manipulation impossible.
            </p>
            <Separator className="my-2 bg-white/[0.06]" />
            <div className="pt-1 flex flex-wrap gap-4 text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Real-Time Socket Presence</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 30s Disconnection Grace</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Host Migration</span>
            </div>
          </Card>
        </motion.div>

        {/* Switch Guest Button */}
        <div className="text-center pt-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={logout}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Change Username or Start a New Guest Session
          </Button>
        </div>

        {/* Modals */}
        <CreateRoomModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
        <JoinRoomModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
      </div>
    </TooltipProvider>
  );
};
