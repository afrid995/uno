import React from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageSquare } from 'lucide-react';

export const ChatToggleButton: React.FC = () => {
  const { isOpen, unreadCount, toggleChat } = useChatStore();

  return (
    <button
      data-testid="chat-toggle-btn"
      onClick={toggleChat}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-display text-xs font-bold transition-all shadow-card cursor-pointer ${
        isOpen
          ? 'bg-blue-600 text-white border-blue-400/60 shadow-card'
          : 'bg-surface-card hover:bg-surface-elevated text-slate-300 border-white/[0.08] hover:border-white/[0.15]'
      }`}
      aria-label="Toggle chat"
    >
      <MessageSquare className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Chat</span>

      {/* Unread badge */}
      {unreadCount > 0 && !isOpen && (
        <span
          data-testid="chat-unread-badge"
          className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white font-mono text-[10px] font-black border-2 border-slate-950 animate-pulse shadow-md"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
