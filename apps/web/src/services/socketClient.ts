import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno-ultimate/game-protocol';
import { SESSION_TOKEN_STORAGE_KEY } from './apiClient';

export type UnoClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketClientManager {
  private socket: UnoClientSocket | null = null;

  getSocket(): UnoClientSocket {
    if (!this.socket) {
      let token: string | undefined;
      try {
        token = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || undefined;
      } catch {
        // ignore
      }

      this.socket = io({
        path: '/socket.io',
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: {
          token,
        },
      });
    }

    return this.socket;
  }

  updateAuthToken(token: string): void {
    if (this.socket) {
      this.socket.auth = { token };
      if (this.socket.connected) {
        this.socket.disconnect().connect();
      }
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketManager = new SocketClientManager();
