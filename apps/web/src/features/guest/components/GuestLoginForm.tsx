import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { USERNAME_RULES } from '@uno-ultimate/shared';
import { useGuestStore } from '../../../stores/guestStore';

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
      <div className="p-6 sm:p-7 rounded-2xl bg-surface-card border border-white/[0.08] shadow-card relative">
        <div className="text-center mb-6">
          <h2 className="font-display font-bold text-xl sm:text-2xl text-white tracking-tight">
            Join the Table
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Enter a display name. No registration or password required.
          </p>
        </div>

        {/* Input Field */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center text-xs">
            <label htmlFor="username-input" className="font-medium text-slate-300">
              Player name
            </label>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                username.length > USERNAME_RULES.MAX_LENGTH ? 'text-rose-400 font-semibold' : 'text-slate-400'
              }`}
            >
              {username.length}/{USERNAME_RULES.MAX_LENGTH}
            </span>
          </div>

          <div className="relative">
            <input
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
              className={`w-full px-4 py-3 rounded-xl bg-surface-panel border text-slate-100 placeholder-slate-500 focus:outline-none transition-colors text-sm sm:text-base ${
                displayError
                  ? 'border-rose-500/80 focus:border-rose-500'
                  : isInputValidLength
                  ? 'border-emerald-500/60 focus:border-emerald-400'
                  : 'border-white/[0.08] focus:border-amber-400/80'
              }`}
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
              className="flex items-start gap-1.5 text-xs text-rose-400 pt-1"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </motion.div>
          )}

          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>Duplicate names supported</span>
            <span>Cryptographic session key</span>
          </div>
        </div>

        {/* Submit Play Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full relative rounded-xl font-display font-semibold text-sm sm:text-base tracking-wide py-3.5 px-5 text-white shadow-card transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#d9383a] hover:bg-[#c6282a] active:bg-[#b02224] border border-white/10 cursor-pointer"
        >
          <div className="flex items-center justify-center gap-2">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Creating guest session...</span>
              </>
            ) : (
              <>
                <span>Play Now</span>
                <Play className="w-3.5 h-3.5 fill-current" />
              </>
            )}
          </div>
        </button>
      </div>
    </form>
  );
};
