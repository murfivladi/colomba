import type { ServerResponse } from 'node:http';

/**
 * Реалтайм для открытого приложения — Server-Sent Events: через прокси shared-хостинга
 * SSE проходит надёжнее WebSocket.
 */
const clients = new Map<number, Set<ServerResponse>>();

export function addClient(userId: number, res: ServerResponse): () => void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
  return () => {
    const set = clients.get(userId);
    set?.delete(res);
    if (set && set.size === 0) clients.delete(userId);
  };
}

export function sendTo(userId: number, event: string, data: unknown): boolean {
  const set = clients.get(userId);
  if (!set || set.size === 0) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
  return true;
}

export function isOnline(userId: number): boolean {
  return (clients.get(userId)?.size ?? 0) > 0;
}

export function onlineCount(): number {
  return clients.size;
}

setInterval(() => {
  for (const set of clients.values()) for (const res of set) res.write(': ping\n\n');
}, 15_000).unref();
