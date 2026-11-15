import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno-ultimate/game-protocol';
import { SESSION_TOKEN_STORAGE_KEY } from './apiClient';

const RAW_SOCKET_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || '';
const SOCKET_URL = RAW_SOCKET_URL ? RAW_SOCKET_URL.replace(/\/+$/, '') : undefined;

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

      this.socket = io(SOCKET_URL, {
        path: '/socket.io',
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
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
