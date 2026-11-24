import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../../stores/chatStore';
import { useGuestStore } from '../../stores/guestStore';
import { MessageSquare, X, Send, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export const ChatPanel: React.FC = () => {
  const { messages, isOpen, isSending, error, setIsOpen, sendMessage, clearError } = useChatStore();
  const currentGuest = useGuestStore((state) => state.guest);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Handle Escape key to close chat
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, setIsOpen]);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    const success = await sendMessage(trimmed);
    if (success) {
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          data-testid="chat-panel"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-20 sm:right-6 w-full sm:w-96 h-[70dvh] sm:h-[460px] max-h-[85dvh] flex flex-col bg-[#141924] border-t sm:border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-modal backdrop-blur-md z-50 overflow-hidden safe-bottom"
        >
          {/* Header */}
          <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/[0.06] bg-[#10141d]/80">
            {/* Mobile Grab Handle */}
            <div className="w-8 h-1 rounded-full bg-white/20 mx-auto mb-1.5 sm:hidden shrink-0" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#1a202d] border border-white/[0.08] flex items-center justify-center text-amber-400">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-200">
                    Room Chat
                  </h3>
                  <p className="text-[10px] text-slate-400">All players in this match</p>
                </div>
              </div>
              <Button
                data-testid="chat-close-btn"
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 rounded-lg text-slate-400 hover:text-white bg-[#10141d] hover:bg-[#1a202d] border border-white/[0.06]"
                aria-label="Close Chat"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-rose-950/80 border-b border-rose-500/40 text-rose-300 text-[11px]">
              <div className="flex items-center gap-1.5 truncate">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span className="truncate">{error}</span>
              </div>
              <button
                onClick={clearError}
                className="text-rose-400 hover:text-rose-200 text-xs ml-2 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Messages Area */}
          <ScrollArea
            data-testid="chat-messages-container"
            className="flex-1 p-3"
          >
            <div className="space-y-2.5">
              {messages.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-1">
                  <MessageSquare className="w-8 h-8 opacity-40 mb-1" />
                  <p className="text-xs font-semibold text-slate-400">No messages yet</p>
                  <p className="text-[10px]">Send a greeting or chat with your table.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSelf = currentGuest?.id === msg.senderGuestId;

                  return (
                    <div
                      key={msg.id}
                      data-testid="chat-message-item"
                      className={cn('flex flex-col', isSelf ? 'items-end' : 'items-start')}
                    >
                      {/* Sender & Timestamp */}
                      <div className="flex items-center gap-1.5 mb-0.5 px-1">
                        <span className="text-[10px] font-bold text-slate-400">
                          {isSelf ? 'You' : msg.senderUsername}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>

                      {/* Speech Bubble */}
                      <div
                        className={cn(
                          'max-w-[85%] px-3 py-2 rounded-2xl text-xs break-words shadow-card',
                          isSelf
                            ? 'bg-red-600 text-white rounded-tr-xs'
                            : 'bg-[#10141d] border border-white/[0.08] text-slate-200 rounded-tl-xs'
                        )}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Footer */}
          <div className="p-2.5 border-t border-white/[0.06] bg-[#10141d]/50">
            <div className="relative flex items-center gap-2">
              <Textarea
                ref={inputRef}
                data-testid="chat-input"
                rows={1}
                maxLength={300}
                inputMode="text"
                enterKeyHint="send"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send)"
                className="w-full min-h-[38px] max-h-24 py-2 pl-3 pr-10 rounded-xl bg-[#10141d] border-white/[0.08] focus-visible:ring-amber-400/80 text-xs text-white placeholder:text-slate-500"
              />
              <Button
                data-testid="chat-send-btn"
                size="icon"
                disabled={!inputText.trim() || isSending}
                onClick={handleSend}
                className="absolute right-1.5 h-7 w-7 rounded-lg bg-red-600 hover:bg-red-500 text-white shadow-sm"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[9px] text-slate-500 font-mono">
              <span>Shift + Enter for newline</span>
              <span>{inputText.length}/300</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
