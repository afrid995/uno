import React, { useState } from 'react';
import { Copy, Check, Share2, Link } from 'lucide-react';

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
    <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-slate-800 relative overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left: Room Code Display */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Private Room Code
          </span>
          <div className="flex items-center gap-3">
            <span data-testid="room-code-display" className="font-mono font-black text-3xl sm:text-4xl text-uno-yellow tracking-[0.2em]">
              {roomCode}
            </span>
            <button
              onClick={handleCopyCode}
              aria-label="Copy room code"
              className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Copy code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Right: Invitation Link Buttons */}
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            onClick={handleCopyLink}
            className="py-2.5 px-4 rounded-xl text-xs font-bold font-display bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white transition-all flex items-center justify-center gap-2"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Invite Link Copied!</span>
              </>
            ) : (
              <>
                <Link className="w-4 h-4 text-uno-blue" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>

          {navigator.share && (
            <button
              onClick={() => {
                navigator.share({
                  title: 'Join my UNO Ultimate Room',
                  text: `Join my private UNO game with code ${roomCode}!`,
                  url: inviteUrl,
                }).catch(() => {});
              }}
              className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
              title="Share Invite"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
