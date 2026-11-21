import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno-ultimate/game-protocol';
import { SESSION_TOKEN_STORAGE_KEY } from './apiClient';

const RAW_SOCKET_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || '';
const SOCKET_URL = RAW_SOCKET_URL ? RAW_SOCKET_URL.replace(/\/+$/, '') : undefined;

export type UnoClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type SocketConnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'reconnected';

class SocketClientManager {
  private socket: UnoClientSocket | null = null;
  private connectionStatus: SocketConnectionStatus = 'disconnected';
  private statusListeners = new Set<(status: SocketConnectionStatus) => void>();
  private reconnectedTimer: NodeJS.Timeout | null = null;
  private hasInitiallyConnected = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.socket && !this.socket.connected) {
          this.setConnectionStatus('reconnecting');
          this.socket.connect();
        }
      });
      window.addEventListener('offline', () => {
        this.setConnectionStatus('reconnecting');
      });
    }
  }

  getConnectionStatus(): SocketConnectionStatus {
    return this.connectionStatus;
  }

  onConnectionStatusChange(listener: (status: SocketConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.connectionStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setConnectionStatus(status: SocketConnectionStatus): void {
    if (this.connectionStatus === status) return;
    this.connectionStatus = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  getSocket(): UnoClientSocket {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        path: '/socket.io',
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        randomizationFactor: 0.5,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        auth: (cb) => {
          let token: string | undefined;
          try {
            token = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || undefined;
          } catch {
            // ignore
          }
          cb({ token });
        },
      });

      this.socket.on('connect', () => {
        if (this.hasInitiallyConnected) {
          this.setConnectionStatus('reconnected');
          if (this.reconnectedTimer) clearTimeout(this.reconnectedTimer);
          this.reconnectedTimer = setTimeout(() => {
            if (this.socket?.connected) {
              this.setConnectionStatus('connected');
            }
          }, 2500);
        } else {
          this.hasInitiallyConnected = true;
          this.setConnectionStatus('connected');
        }
      });

      this.socket.on('disconnect', (reason) => {
        if (this.reconnectedTimer) clearTimeout(this.reconnectedTimer);
        if (reason === 'io server disconnect') {
          this.setConnectionStatus('disconnected');
        } else {
          this.setConnectionStatus('reconnecting');
        }
      });

      this.socket.on('connect_error', () => {
        this.setConnectionStatus('reconnecting');
      });

      this.socket.io.on('reconnect_attempt', () => {
        this.setConnectionStatus('reconnecting');
      });

      this.socket.io.on('reconnect', () => {
        this.setConnectionStatus('reconnected');
        if (this.reconnectedTimer) clearTimeout(this.reconnectedTimer);
        this.reconnectedTimer = setTimeout(() => {
          if (this.socket?.connected) {
            this.setConnectionStatus('connected');
          }
        }, 2500);
      });
    }

    return this.socket;
  }

  updateAuthToken(token: string): void {
    try {
      sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore
    }

    if (this.socket) {
      this.socket.auth = { token };
      if (this.socket.connected) {
        this.socket.disconnect().connect();
      } else {
        this.socket.connect();
      }
    } else {
      this.getSocket();
    }
  }

  async ensureConnected(timeoutMs = 5000): Promise<UnoClientSocket> {
    const socket = this.getSocket();
    if (socket.connected) {
      return socket;
    }

    return new Promise<UnoClientSocket>((resolve) => {
      let settled = false;
      const onConnect = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(socket);
        }
      };

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.off('connect', onConnect);
          resolve(socket);
        }
      }, timeoutMs);

      socket.once('connect', onConnect);
      if (!socket.connected) {
        socket.connect();
      }
    });
  }

  disconnect(): void {
    if (this.reconnectedTimer) {
      clearTimeout(this.reconnectedTimer);
      this.reconnectedTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.hasInitiallyConnected = false;
    this.setConnectionStatus('disconnected');
  }
}

export const socketManager = new SocketClientManager();
