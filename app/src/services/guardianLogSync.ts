import type { OnDeviceChatMessage } from './onDeviceAi';

type SyncGuardianLogInput = {
  roomId: string;
  clientLogId: string;
  title?: string;
  messages: OnDeviceChatMessage[];
};

type BackendGuardianLogSyncResult = {
  syncedAt: string;
};

type RequestLike = {
  request<T>(path: string, init?: RequestInit, options?: unknown): Promise<T>;
};

export type GuardianLogMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

export type GuardianConversationLog = {
  id: string;
  childUserId: string;
  roomId: string;
  title: string;
  messageCount: number;
  messages: GuardianLogMessage[];
  syncedAt: string;
  updatedAt: string;
};

export async function syncGuardianConversationLog(
  client: RequestLike,
  input: SyncGuardianLogInput
): Promise<string | null> {
  const messages = (input.messages || [])
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message) => typeof message.content === 'string')
    .slice(-60)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content.slice(0, 4000),
      createdAt: message.createdAt,
    }));
  if (!messages.length) return null;

  try {
    const result = await client.request<BackendGuardianLogSyncResult>(
      '/v1/guardian-logs/sync',
      {
        method: 'POST',
        body: JSON.stringify({
          roomId: input.roomId,
          clientLogId: input.clientLogId,
          ...(input.title ? { title: input.title } : {}),
          messages,
        }),
      },
      { queue: false, timeoutMs: 10000, rateLimitRetries: 1 }
    );
    return result?.syncedAt || null;
  } catch {
    return null;
  }
}

export async function fetchGuardianConversationLogs(
  client: RequestLike,
  childUserId: string,
  limit = 30
): Promise<GuardianConversationLog[]> {
  try {
    const result = await client.request<{ items?: GuardianConversationLog[] }>(
      `/v1/guardian-logs/${encodeURIComponent(childUserId)}?limit=${limit}`,
      { method: 'GET' },
      { queue: false, timeoutMs: 15000, rateLimitRetries: 1 }
    );
    return Array.isArray(result?.items) ? result.items : [];
  } catch {
    return [];
  }
}
