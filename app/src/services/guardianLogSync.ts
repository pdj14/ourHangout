import type { OnDeviceChatMessage } from './onDeviceAi';
import { guardianLogBatches } from './guardianLogPayload';

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
  getBaseUrl?: () => string;
};
const capabilities = new WeakMap<RequestLike, { origin: string; until: number; value: Promise<{ merge: boolean; maxChars: number; maxBytes: number }> }>();

async function logCapabilities(client: RequestLike) {
  const origin = client.getBaseUrl?.() || '';
  const cached = capabilities.get(client);
  if (cached && cached.origin === origin && cached.until > Date.now()) return cached.value;
  const value = client.request<{ guardianLogs?: { mergeSync?: boolean; maxMessageChars?: number; maxBodyBytes?: number } }>('/v1/capabilities', { method: 'GET' }, { auth: false, queue: false, timeoutMs: 4000, rateLimitRetries: 0 })
    .then(result => ({ merge: result.guardianLogs?.mergeSync === true, maxChars: Math.max(1, Math.min(100000, result.guardianLogs?.maxMessageChars || 4000)), maxBytes: Math.max(1024, Math.floor(Math.min(result.guardianLogs?.maxBodyBytes || 1048576, 1048576) * 0.8)) }))
    .catch(() => ({ merge: false, maxChars: 4000, maxBytes: 800000 }));
  capabilities.set(client, { origin, until: Date.now() + 60000, value });
  return value;
}

export type GuardianLogMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  truncated?: boolean;
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
      content: message.content,
      createdAt: message.createdAt,
    }));
  if (!messages.length) return null;

  try {
    const limits = await logCapabilities(client);
    const envelope = { roomId: input.roomId, clientLogId: input.clientLogId, ...(input.title ? { title: input.title } : {}), ...(limits.merge ? { mode: 'merge' } : {}) };
    const batches = guardianLogBatches(messages, limits.maxChars, limits.maxBytes, envelope, limits.merge);
    let syncedAt: string | null = null;
    for (const batch of batches) {
    const result = await client.request<BackendGuardianLogSyncResult>(
      '/v1/guardian-logs/sync',
      {
        method: 'POST',
        body: JSON.stringify({ ...envelope, messages: batch }),
      },
      { queue: false, timeoutMs: 10000, rateLimitRetries: 1 }
    );
    syncedAt = result?.syncedAt || syncedAt;
    }
    return syncedAt;
  } catch {
    return null;
  }
}

export async function fetchGuardianConversationLogs(
  client: RequestLike,
  childUserId: string,
  limit = 30
): Promise<GuardianConversationLog[]> {
    const result = await client.request<{ items?: GuardianConversationLog[] }>(
      `/v1/guardian-logs/${encodeURIComponent(childUserId)}?limit=${limit}`,
      { method: 'GET' },
      { queue: false, timeoutMs: 15000, rateLimitRetries: 1 }
    );
    if (!Array.isArray(result?.items)) throw new Error('사용 내역을 읽지 못했어요. 다시 시도해 주세요.');
    return result.items;
}
