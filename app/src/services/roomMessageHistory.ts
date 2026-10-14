import type { BackendListData, BackendRoomMessage } from '../types';

type MessageClient = { request<T>(path: string, init?: RequestInit, options?: { rateLimitRetries: number; timeoutMs: number; queue: boolean }): Promise<T> };

export async function fetchRoomMessagePage(client: MessageClient, roomId: string, cursor?: string) {
  const path = `/v1/rooms/${encodeURIComponent(roomId)}/messages?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const raw = await client.request<BackendRoomMessage[] | BackendListData<BackendRoomMessage>>(
    path, { method: 'GET' }, { rateLimitRetries: 2, timeoutMs: 15000, queue: false }
  );
  const items = Array.isArray(raw) ? raw : raw?.items;
  if (!Array.isArray(items)) throw new Error('메시지를 불러오지 못했어요. 다시 시도해 주세요.');
  const nextCursor = !Array.isArray(raw) && typeof raw.nextCursor === 'string' ? raw.nextCursor.trim() : '';
  return { items, nextCursor: nextCursor && nextCursor !== cursor ? nextCursor : undefined };
}
