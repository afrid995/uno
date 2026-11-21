import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../../stores/chatStore';
import { useGuestStore } from '../../stores/guestStore';
import { MessageSquare, X, Send, AlertCircle } from 'lucide-react';

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

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    const success = await sendMessage(trimmed);
    if (success) {
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-16 sm:bottom-20 right-2 sm:right-6 w-[calc(100vw-1rem)] sm:w-96 h-[460px] max-h-[75vh] flex flex-col bg-surface-card border border-white/[0.08] rounded-2xl shadow-modal backdrop-blur-md z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-surface-panel/80">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-200">
                  Room Chat
                </h3>
                <p className="text-[10px] text-slate-400">All players in this match</p>
              </div>
            </div>
            <button
              data-testid="chat-close-btn"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white bg-surface-panel hover:bg-surface-elevated border border-white/[0.06] transition-colors"
              aria-label="Close Chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-rose-950/80 border-b border-rose-500/40 text-rose-300 text-[11px]">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span className="truncate">{error}</span>
              </div>
              <button
                onClick={clearError}
                className="text-rose-400 hover:text-rose-200 text-xs ml-2 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Messages Area */}
          <div
            data-testid="chat-messages-container"
            className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-1">
                <MessageSquare className="w-8 h-8 opacity-40 mb-1" />
                <p className="text-xs font-semibold text-slate-400">No messages yet</p>
                <p className="text-[10px]">Say hello or cheer on your teammates!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isSelf = currentGuest?.id === msg.senderGuestId;

                return (
                  <div
                    key={msg.id}
                    data-testid="chat-message-item"
                    className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
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
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs break-words shadow-card ${
                        isSelf
                          ? 'bg-blue-600 text-white rounded-tr-xs'
                          : 'bg-surface-panel border border-white/[0.08] text-slate-200 rounded-tl-xs'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-2.5 border-t border-white/[0.06] bg-surface-panel/50">
            <div className="relative flex items-center gap-2">
              <textarea
                ref={inputRef}
                data-testid="chat-input"
                rows={1}
                maxLength={300}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send)"
                className="w-full resize-none py-2 pl-3 pr-10 rounded-xl bg-surface-panel border border-white/[0.08] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 text-xs text-white placeholder-slate-500 outline-none transition-all max-h-24 no-scrollbar"
              />
              <button
                data-testid="chat-send-btn"
                disabled={!inputText.trim() || isSending}
                onClick={handleSend}
                className="absolute right-1.5 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all cursor-pointer shadow-card"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[9px] text-slate-500 font-mono">
              <span>Shift + Enter for new line</span>
              <span>{inputText.length}/300</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
