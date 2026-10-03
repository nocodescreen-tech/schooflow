import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../hooks/useWebSocket';

export default function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const { isConnected, connect, disconnect } = useWebSocket();

  useEffect(() => {
    if (token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  // Optional: Show connection status in development
  if (import.meta && (import.meta as any).env?.DEV) {
    console.log(`WebSocket: ${isConnected ? 'connected' : 'disconnected'}`);
  }

  return <>{children}</>;
}