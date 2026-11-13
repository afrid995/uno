import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, AlertCircle, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
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
  const isInputValidLength = username.trim().length >= USERNAME_RULES.MIN_LENGTH && username.trim().length <= USERNAME_RULES.MAX_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto" noValidate>
      <div className="glass-panel p-6 sm:p-8 rounded-2xl shadow-2xl relative overflow-hidden">
        {/* Glowing border accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-uno-red via-uno-yellow to-uno-blue" />

        <div className="text-center mb-6">
          <h2 className="font-display font-bold text-2xl text-white tracking-tight flex items-center justify-center gap-2">
            Enter Game Lobby
            <Sparkles className="w-5 h-5 text-uno-yellow" />
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Choose a display name. No signup or password needed.
          </p>
        </div>

        {/* Input Field */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center text-xs">
            <label htmlFor="username-input" className="font-medium text-slate-300">
              Player Name
            </label>
            <span
              className={`font-mono text-[11px] ${
                username.length > USERNAME_RULES.MAX_LENGTH ? 'text-rose-400 font-bold' : 'text-slate-500'
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
              className={`w-full px-4 py-3.5 rounded-xl bg-slate-900/90 border text-slate-100 placeholder-slate-500 focus:outline-none transition-all duration-200 text-base ${
                displayError
                  ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/50'
                  : isInputValidLength
                  ? 'border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/40'
                  : 'border-slate-700 focus:ring-2 focus:ring-uno-yellow/40 focus:border-uno-yellow/60'
              }`}
            />
            {isInputValidLength && !displayError && (
              <CheckCircle2 className="absolute right-3.5 top-3.5 w-5 h-5 text-emerald-400 pointer-events-none" />
            )}
          </div>

          {/* Error Message */}
          {displayError && (
            <motion.div
              id="username-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 text-xs text-rose-400 pt-1"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </motion.div>
          )}

          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>• Duplicate names allowed</span>
            <span>• Secure guest token generated</span>
          </div>
        </div>

        {/* Submit Play Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full relative group overflow-hidden rounded-xl font-display font-bold text-base tracking-wide py-4 px-6 text-white shadow-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-500 hover:shadow-glow hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center justify-center gap-2">
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating Guest Session...</span>
              </>
            ) : (
              <>
                <span>Play Now</span>
                <Play className="w-4 h-4 fill-current transition-transform group-hover:translate-x-1" />
              </>
            )}
          </div>
        </button>
      </div>
    </form>
  );
};
