import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ArrowRight } from 'lucide-react';
import { ROOM_RULES } from '@uno-ultimate/shared';
import { useRoomStore } from '../../../stores/roomStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ isOpen, onClose }) => {
  const [roomCode, setRoomCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { joinRoom, isLoading, error: storeError, clearError } = useRoomStore();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Uppercase automatically and remove invalid characters
    const clean = e.target.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');
    setRoomCode(clean.slice(0, ROOM_RULES.CODE_LENGTH));
    if (localError) setLocalError(null);
    if (storeError) clearError();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length !== ROOM_RULES.CODE_LENGTH) {
      setLocalError(`Room code must be exactly ${ROOM_RULES.CODE_LENGTH} characters.`);
      return;
    }

    clearError();
    const success = await joinRoom({ roomCode });
    if (success) {
      onClose();
      navigate(`/room/${roomCode}`);
    }
  };

  const displayError = localError || storeError;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#141924] w-full max-w-md p-6 sm:p-7 rounded-2xl border-white/[0.08] shadow-modal overflow-hidden">
        <DialogHeader className="mb-2 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-white/[0.1] flex items-center justify-center text-slate-300 shrink-0">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="font-display font-bold text-xl text-white">
                Join Private Room
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                Enter a 6-character room code
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleJoin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="room-code-input" className="block text-xs font-medium text-slate-300 normal-case tracking-normal">
              Room Code
            </Label>

            <div className="relative">
              <Input
                id="room-code-input"
                type="text"
                value={roomCode}
                onChange={handleInputChange}
                placeholder="e.g. 7X8K2M"
                maxLength={ROOM_RULES.CODE_LENGTH}
                autoComplete="off"
                autoFocus
                className={cn(
                  'h-14 text-center text-2xl font-mono uppercase tracking-[0.25em] font-extrabold px-4 rounded-xl bg-[#10141d] border border-white/[0.12] text-amber-300 placeholder:text-slate-600 focus-visible:ring-amber-400/80 focus-visible:border-amber-400 transition-all',
                  displayError && 'border-rose-500/80 focus-visible:ring-rose-500'
                )}
              />
            </div>

            {displayError && (
              <Alert variant="destructive" className="py-2 px-3 rounded-xl border-rose-500/30 bg-rose-950/40">
                <AlertDescription className="text-xs text-rose-300">
                  {displayError}
                </AlertDescription>
              </Alert>
            )}

            <p className="text-[11px] text-slate-500">
              Codes are 6 uppercase letters and numbers (excluding 0, O, 1, I).
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-[#1a202d] border-white/[0.08]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="confirm-join-room-btn"
              disabled={isLoading || roomCode.length !== ROOM_RULES.CODE_LENGTH}
              variant="default"
              className="flex-1 py-3 rounded-xl text-xs font-bold font-display text-white bg-red-600 hover:bg-red-500 active:bg-red-700 border-red-500/30 shadow-sm disabled:opacity-50 gap-2"
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  <span>Joining...</span>
                </>
              ) : (
                <>
                  <span>Enter Room</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
