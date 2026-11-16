import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';
import { ChatToggleButton } from '../ChatToggleButton';
import { useChatStore } from '../../../stores/chatStore';
import { useGuestStore } from '../../../stores/guestStore';
import { ChatMessageDto } from '@uno-ultimate/game-protocol';

describe('Real-Time Multiplayer Chat Components', () => {
  const currentGuestUser = {
    id: 'guest-self-1',
    username: 'AliceHost',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    lastSeenAt: new Date().toISOString(),
  };

  beforeEach(() => {
    act(() => {
      useChatStore.getState().reset();
      useGuestStore.setState({ guest: currentGuestUser });
    });
    vi.clearAllMocks();
  });

  describe('useChatStore', () => {
    it('initializes with default closed state and zero unread messages', () => {
      const state = useChatStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.unreadCount).toBe(0);
      expect(state.messages).toEqual([]);
      expect(state.error).toBeNull();
    });

    it('increments unreadCount when message arrives while chat is closed', () => {
      const msg: ChatMessageDto = {
        id: 'msg-1',
        roomId: 'room-1',
        senderGuestId: 'guest-other-2',
        senderUsername: 'BobRival',
        message: 'Hello table!',
        createdAt: new Date().toISOString(),
      };

      act(() => {
        useChatStore.getState().addMessage(msg);
      });

      const state = useChatStore.getState();
      expect(state.messages.length).toBe(1);
      expect(state.unreadCount).toBe(1);
    });

    it('resets unreadCount to 0 when chat is opened', () => {
      const msg: ChatMessageDto = {
        id: 'msg-2',
        roomId: 'room-1',
        senderGuestId: 'guest-other-2',
        senderUsername: 'BobRival',
        message: 'Draw four coming up!',
        createdAt: new Date().toISOString(),
      };

      act(() => {
        useChatStore.getState().addMessage(msg);
      });
      expect(useChatStore.getState().unreadCount).toBe(1);

      act(() => {
        useChatStore.getState().setIsOpen(true);
      });
      expect(useChatStore.getState().unreadCount).toBe(0);
      expect(useChatStore.getState().isOpen).toBe(true);
    });

    it('does not increment unreadCount when chat is already open', () => {
      act(() => {
        useChatStore.getState().setIsOpen(true);
      });

      const msg: ChatMessageDto = {
        id: 'msg-3',
        roomId: 'room-1',
        senderGuestId: 'guest-other-2',
        senderUsername: 'BobRival',
        message: 'Nice play!',
        createdAt: new Date().toISOString(),
      };

      act(() => {
        useChatStore.getState().addMessage(msg);
      });

      expect(useChatStore.getState().unreadCount).toBe(0);
    });
  });

  describe('ChatPanel Component', () => {
    it('does not render when isOpen is false', () => {
      act(() => {
        useChatStore.getState().setIsOpen(false);
      });

      render(<ChatPanel />);
      expect(screen.queryByTestId('chat-panel')).toBeNull();
    });

    it('renders empty message state when opened with no messages', () => {
      act(() => {
        useChatStore.getState().setIsOpen(true);
      });

      render(<ChatPanel />);
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
      expect(screen.getByText('No messages yet')).toBeInTheDocument();
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      expect(screen.getByTestId('chat-send-btn')).toBeInTheDocument();
    });

    it('renders messages distinguishing between self and opponent', () => {
      const selfMsg: ChatMessageDto = {
        id: 'msg-self',
        roomId: 'room-1',
        senderGuestId: 'guest-self-1',
        senderUsername: 'AliceHost',
        message: 'I have UNO!',
        createdAt: '2026-11-16T12:00:00.000Z',
      };

      const opponentMsg: ChatMessageDto = {
        id: 'msg-opp',
        roomId: 'room-1',
        senderGuestId: 'guest-other-2',
        senderUsername: 'BobRival',
        message: 'Not on my turn!',
        createdAt: '2026-11-16T12:01:00.000Z',
      };

      act(() => {
        useChatStore.getState().setIsOpen(true);
        useChatStore.getState().addMessage(selfMsg);
        useChatStore.getState().addMessage(opponentMsg);
      });

      render(<ChatPanel />);

      expect(screen.getByText('I have UNO!')).toBeInTheDocument();
      expect(screen.getByText('You')).toBeInTheDocument();

      expect(screen.getByText('Not on my turn!')).toBeInTheDocument();
      expect(screen.getByText('BobRival')).toBeInTheDocument();
    });

    it('handles message typing and character counter', () => {
      act(() => {
        useChatStore.getState().setIsOpen(true);
      });

      render(<ChatPanel />);
      const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;

      fireEvent.change(input, { target: { value: 'Good game everyone!' } });
      expect(input.value).toBe('Good game everyone!');
      expect(screen.getByText('19/300')).toBeInTheDocument();
    });

    it('closes panel when close button is clicked', () => {
      act(() => {
        useChatStore.getState().setIsOpen(true);
      });

      render(<ChatPanel />);
      const closeBtn = screen.getByTestId('chat-close-btn');

      fireEvent.click(closeBtn);
      expect(useChatStore.getState().isOpen).toBe(false);
    });

    it('displays error banner and clears error when dismissed', () => {
      act(() => {
        useChatStore.getState().setIsOpen(true);
        useChatStore.setState({ error: 'Chat rate limit exceeded. Please wait a moment.' });
      });

      render(<ChatPanel />);
      expect(screen.getByText('Chat rate limit exceeded. Please wait a moment.')).toBeInTheDocument();

      const dismissBtn = screen.getByText('✕');
      fireEvent.click(dismissBtn);
      expect(useChatStore.getState().error).toBeNull();
    });
  });

  describe('ChatToggleButton Component', () => {
    it('renders toggle button in closed state', () => {
      render(<ChatToggleButton />);
      const btn = screen.getByTestId('chat-toggle-btn');
      expect(btn).toBeInTheDocument();
      expect(screen.queryByTestId('chat-unread-badge')).toBeNull();
    });

    it('displays unread badge when there are unread messages and panel is closed', () => {
      act(() => {
        useChatStore.getState().setIsOpen(false);
        useChatStore.getState().addMessage({
          id: 'msg-badge',
          roomId: 'room-1',
          senderGuestId: 'guest-other-2',
          senderUsername: 'BobRival',
          message: 'Hello!',
          createdAt: new Date().toISOString(),
        });
      });

      render(<ChatToggleButton />);
      const badge = screen.getByTestId('chat-unread-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('1');
    });

    it('toggles chat open on click', () => {
      render(<ChatToggleButton />);
      const btn = screen.getByTestId('chat-toggle-btn');

      fireEvent.click(btn);
      expect(useChatStore.getState().isOpen).toBe(true);

      fireEvent.click(btn);
      expect(useChatStore.getState().isOpen).toBe(false);
    });
  });
});
