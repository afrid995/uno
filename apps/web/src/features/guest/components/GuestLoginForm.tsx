import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, AlertCircle, CheckCircle2 } from 'lucide-react';
import { USERNAME_RULES } from '@uno-ultimate/shared';
import { useGuestStore } from '../../../stores/guestStore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export const GuestLoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const { createGuest, isLoading, error: serverError, clearError } = useGuestStore();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    if (localError) setLocalError(null);
    if (serverError) clearError();
  };

  const validateInput = (): boolean => {
    const trimmed = username.trim();
    if (!trimmed) {
      setLocalError('Please enter a username to play.');
      return false;
    }
    if (trimmed.length < USERNAME_RULES.MIN_LENGTH) {
      setLocalError(`Username must be at least ${USERNAME_RULES.MIN_LENGTH} characters.`);
      return false;
    }
    if (trimmed.length > USERNAME_RULES.MAX_LENGTH) {
      setLocalError(`Username cannot exceed ${USERNAME_RULES.MAX_LENGTH} characters.`);
      return false;
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
      setLocalError('Username contains unsupported control characters.');
      return false;
    }
    if (!USERNAME_RULES.PATTERN.test(trimmed)) {
      setLocalError('Username can only contain letters, numbers, spaces, underscores, dots, and hyphens.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInput() || isLoading) return;

    await createGuest(username.trim());
  };

  const displayError = localError || serverError;
  const isInputValidLength =
    username.trim().length >= USERNAME_RULES.MIN_LENGTH &&
    username.trim().length <= USERNAME_RULES.MAX_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto" noValidate>
      <Card className="p-6 sm:p-7 bg-[#141924] border-white/[0.08] shadow-card relative">
        <CardHeader className="p-0 text-center mb-6">
          <CardTitle className="font-display font-bold text-xl sm:text-2xl text-white tracking-tight">
            Join the Table
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-slate-400 mt-1">
            Enter a display name. No registration or password required.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {/* Input Field */}
          <div className="space-y-2 mb-6">
            <div className="flex justify-between items-center text-xs">
              <Label htmlFor="username-input" className="font-medium text-slate-300 normal-case tracking-normal">
                Player name
              </Label>
              <span
                className={cn(
                  'font-mono text-[11px] tabular-nums',
                  username.length > USERNAME_RULES.MAX_LENGTH ? 'text-rose-400 font-semibold' : 'text-slate-400'
                )}
              >
                {username.length}/{USERNAME_RULES.MAX_LENGTH}
              </span>
            </div>

            <div className="relative">
              <Input
                id="username-input"
                type="text"
                value={username}
                onChange={handleInputChange}
                maxLength={USERNAME_RULES.MAX_LENGTH}
                placeholder="e.g. CardMaster, Alex, Player 1"
                autoComplete="off"
                autoFocus
                disabled={isLoading}
                aria-invalid={!!displayError}
                aria-describedby={displayError ? 'username-error' : undefined}
                className={cn(
                  'h-12 px-4 rounded-xl bg-[#10141d] border text-slate-100 placeholder:text-slate-500 text-sm sm:text-base',
                  displayError
                    ? 'border-rose-500/80 focus-visible:ring-rose-500 focus-visible:border-rose-500'
                    : isInputValidLength
                    ? 'border-emerald-500/60 focus-visible:ring-emerald-400'
                    : 'border-white/[0.08] focus-visible:ring-amber-400/80'
                )}
              />
              {isInputValidLength && !displayError && (
                <CheckCircle2 className="absolute right-3.5 top-3.5 w-4 h-4 text-emerald-400 pointer-events-none" />
              )}
            </div>

            {/* Error Alert */}
            {displayError && (
              <motion.div
                id="username-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Alert variant="destructive" className="py-2.5 px-3 rounded-xl border-rose-500/30 bg-rose-950/40">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <AlertDescription className="text-xs text-rose-300">
                    {displayError}
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
              <span>Duplicate names supported</span>
              <span>Cryptographic session key</span>
            </div>
          </div>

          {/* Submit Play Button */}
          <Button
            type="submit"
            disabled={isLoading}
            variant="default"
            size="lg"
            className="w-full relative rounded-xl font-display font-semibold text-sm sm:text-base tracking-wide py-3.5 text-white shadow-card bg-[#d9383a] hover:bg-[#c6282a] active:bg-[#b02224] border border-white/10"
          >
            <div className="flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  <span>Creating guest session...</span>
                </>
              ) : (
                <>
                  <span>Play Now</span>
                  <Play className="w-3.5 h-3.5 fill-current" />
                </>
              )}
            </div>
          </Button>
        </CardContent>
      </Card>
    </form>
  );
};
