import React, { useState } from 'react';
import { Copy, Check, Share2, Link } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InviteLinkCardProps {
  roomCode: string;
}

export const InviteLinkCard: React.FC<InviteLinkCardProps> = ({ roomCode }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteUrl = `${window.location.origin}/join/${roomCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <TooltipProvider>
      <Card className="bg-[#141924] p-5 sm:p-6 rounded-2xl border-white/[0.08] shadow-card relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Left: Room Code Display */}
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 block mb-1">
              Private Room Code
            </span>
            <div className="flex items-center gap-3">
              <span data-testid="room-code-display" className="font-mono font-extrabold text-3xl sm:text-4xl text-amber-400 tracking-[0.2em]">
                {roomCode}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleCopyCode}
                    aria-label="Copy room code"
                    className="h-9 w-9 rounded-xl bg-[#10141d] border-white/[0.08] hover:bg-[#1a202d] text-slate-300 hover:text-white"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy room code</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Right: Invitation Link Buttons */}
          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={handleCopyLink}
              className="py-2.5 px-4 rounded-xl text-xs font-bold font-display bg-[#1a202d] hover:bg-[#222a3a] border-white/[0.08] text-slate-200 hover:text-white gap-2"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Invite Link Copied!</span>
                </>
              ) : (
                <>
                  <Link className="w-4 h-4 text-amber-400" />
                  <span>Copy Invite Link</span>
                </>
              )}
            </Button>

            {navigator.share && (
              <Button
                variant="secondary"
                size="icon"
                onClick={() => {
                  navigator.share({
                    title: 'Join my UNO Ultimate Room',
                    text: `Join my private UNO game with code ${roomCode}!`,
                    url: inviteUrl,
                  }).catch(() => {});
                }}
                className="h-10 w-10 rounded-xl bg-[#10141d] border-white/[0.08] hover:bg-[#1a202d] text-slate-300 hover:text-white"
                title="Share Invite"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
};
