import type {
  BackendAuthData,
  BackendEnvelope,
  BackendListData,
  BackendRequestError,
} from '../types';
import type { PersistedSession } from './session';

type BackendClientOptions = {
  baseUrl: string;
  getSession: () => PersistedSession | null;
  saveSession: (session: PersistedSession | null) => Promise<void>;
  onSessionExpired?: (error: BackendRequestError) => void;
};

type RequestOptions = {
  auth?: boolean;
  timeoutMs?: number;
  rateLimitRetries?: number;
  queue?: boolean;
};

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_DELAY_MS = 8000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
  const base = 900 * 2 ** Math.max(0, attempt);
  const jitter = Math.round(Math.random() * 300);
  return Math.min(5000, base + jitter);
}

function retryAfterDelayMs(response: Response): number {
  const raw = String(response.headers.get('Retry-After') || '').trim();
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(MAX_RATE_LIMIT_DELAY_MS, seconds * 1000);
  }

  const retryAt = Date.parse(raw);
  if (!Number.isNaN(retryAt)) {
    return Math.min(MAX_RATE_LIMIT_DELAY_MS, Math.max(0, retryAt - Date.now()));
  }

  return 0;
}

function rateLimitDelayMs(response: Response, attempt: number): number {
  return Math.max(retryAfterDelayMs(response), retryDelayMs(attempt));
}

export function normalizeBackendBaseUrl(value?: string | null): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function toWsBaseUrl(baseUrl: string): string {
  return normalizeBackendBaseUrl(baseUrl).replace(/^https?/i, (value) =>
    value.toLowerCase() === 'https' ? 'wss' : 'ws'
  );
}

export function asListItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const record = value as BackendListData<T> & {
      messages?: T[];
      rooms?: T[];
      friends?: T[];
      results?: T[];
      data?: unknown;
    };
    if (Array.isArray(record.items)) return record.items || [];
    if (Array.isArray(record.messages)) return record.messages || [];
    if (Array.isArray(record.rooms)) return record.rooms || [];
    if (Array.isArray(record.friends)) return record.friends || [];
    if (Array.isArray(record.results)) return record.results || [];
    if (record.data !== value) return asListItems<T>(record.data);
  }
  return [];
}

export function createBackendRequestError(
  message: string,
  options?: { status?: number; code?: string }
): BackendRequestError {
  const error = new Error(message || 'Request failed') as BackendRequestError;
  if (typeof options?.status === 'number') error.status = options.status;
  if (options?.code) error.code = options.code;
  return error;
}

function getBackendErrorDetails(raw: unknown): { message: string; code: string } {
  if (!raw || typeof raw !== 'object') return { message: '', code: '' };
  const body = raw as BackendEnvelope<unknown>;
  return {
    message: String(body.error?.message || body.message || '').trim(),
    code: String(body.error?.code || '').trim(),
  };
}

export function toBackendRequestError(
  raw: unknown,
  fallbackMessage: string,
  status?: number
): BackendRequestError {
  const details = getBackendErrorDetails(raw);
  return createBackendRequestError(details.message || fallbackMessage, {
    ...(typeof status === 'number' ? { status } : {}),
    ...(details.code ? { code: details.code } : {}),
  });
}

export function isSessionInvalidError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const requestError = error as BackendRequestError;
  const status = typeof requestError.status === 'number' ? requestError.status : 0;
  const code = String(requestError.code || '').trim();
  const message = String(error.message || '').trim().toLowerCase();
  return (
    code === 'AUTH_REFRESH_INVALID' ||
    code === 'AUTH_UNAUTHORIZED' ||
    (status === 401 && !code) ||
    message.includes('refresh token is invalid or expired')
  );
}

function unwrapEnvelope<T>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') return {} as T;
  const body = raw as BackendEnvelope<T>;
  if (body.ok === false || body.success === false) {
    throw toBackendRequestError(raw, 'Request failed');
  }
  if (body.data !== undefined) return body.data;
  return raw as T;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createBackendRequestError('Request timed out.', { code: 'NETWORK_TIMEOUT' });
    }
    throw createBackendRequestError(error instanceof Error ? error.message : 'Network request failed.', {
      code: 'NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class BackendClient {
  private baseUrl: string;
  private getSession: () => PersistedSession | null;
  private saveSession: (session: PersistedSession | null) => Promise<void>;
  private onSessionExpired?: (error: BackendRequestError) => void;
  private refreshInFlight: Promise<PersistedSession> | null = null;
  private requestQueue: Promise<void> = Promise.resolve();
  private rateLimitUntil = 0;

  constructor(options: BackendClientOptions) {
    this.baseUrl = normalizeBackendBaseUrl(options.baseUrl);
    this.getSession = options.getSession;
    this.saveSession = options.saveSession;
    this.onSessionExpired = options.onSessionExpired;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getAccessToken(): string {
    return String(this.getSession()?.accessToken || '').trim();
  }

  async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    if (options.queue === false) {
      return this.requestNow<T>(path, init, options);
    }
    return this.runQueued(() => this.requestNow<T>(path, init, options));
  }

  private async requestNow<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const auth = options.auth ?? true;
    const normalizedPath = /^https?:\/\//i.test(path) ? new URL(path).pathname : path;
    const url = /^https?:\/\//i.test(path) ? path : `${this.baseUrl}${path}`;
    const run = async (accessToken?: string) => {
      const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> | undefined),
      };
      if (!headers['Content-Type'] && typeof init.body === 'string') {
        headers['Content-Type'] = 'application/json';
      }
      if (auth && accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetchWithTimeout(url, { ...init, headers }, options.timeoutMs);
      const json = await parseJsonResponse(response);
      return { response, json };
    };

    let session = this.getSession();
    const runWithRateLimitRetry = async (accessToken?: string) => {
      const maxRetries = Math.max(0, options.rateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES);
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        await this.waitForRateLimitCooldown();
        const result = await run(accessToken);
        if (result.response.status !== 429) {
          return result;
        }
        if (maxRetries <= 0) {
          return result;
        }
        const waitMs = rateLimitDelayMs(result.response, attempt);
        this.rememberRateLimit(waitMs);
        if (attempt >= maxRetries) {
          return result;
        }
        await delay(waitMs);
      }
      return run(accessToken);
    };

    let result = await runWithRateLimitRetry(auth ? session?.accessToken : undefined);

    if (
      auth &&
      result.response.status === 401 &&
      normalizedPath !== '/v1/auth/refresh' &&
      normalizedPath !== '/v1/auth/google'
    ) {
      try {
        session = await this.refreshSession();
        result = await runWithRateLimitRetry(session.accessToken);
      } catch (error) {
        const requestError =
          error instanceof Error ? (error as BackendRequestError) : createBackendRequestError('Session expired.');
        await this.saveSession(null);
        this.onSessionExpired?.(requestError);
        throw requestError;
      }
    }

    if (!result.response.ok) {
      throw toBackendRequestError(result.json, `HTTP ${result.response.status}`, result.response.status);
    }

    return unwrapEnvelope<T>(result.json);
  }

  private async runQueued<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.requestQueue.catch(() => undefined);
    let release: () => void = () => undefined;
    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private async waitForRateLimitCooldown(): Promise<void> {
    const waitMs = this.rateLimitUntil - Date.now();
    if (waitMs > 0) {
      await delay(Math.min(MAX_RATE_LIMIT_DELAY_MS, waitMs));
    }
  }

  private rememberRateLimit(waitMs: number): void {
    this.rateLimitUntil = Math.max(this.rateLimitUntil, Date.now() + waitMs);
  }

  private async refreshSession(): Promise<PersistedSession> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const refreshToken = String(this.getSession()?.refreshToken || '').trim();
      if (!refreshToken) {
        throw createBackendRequestError('Refresh token is missing.', { code: 'AUTH_REFRESH_INVALID' });
      }

      const response = await fetchWithTimeout(
        `${this.baseUrl}/v1/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        },
        DEFAULT_TIMEOUT_MS
      );
      const json = await parseJsonResponse(response);
      if (!response.ok) {
        throw toBackendRequestError(json, `HTTP ${response.status}`, response.status);
      }

      const data = unwrapEnvelope<BackendAuthData>(json);
      const accessToken = String(data.accessToken || data.tokens?.accessToken || '').trim();
      const nextRefreshToken = String(data.refreshToken || data.tokens?.refreshToken || refreshToken).trim();
      if (!accessToken) {
        throw createBackendRequestError('Refresh token is invalid or expired.', {
          code: 'AUTH_REFRESH_INVALID',
        });
      }

      const nextSession: PersistedSession = {
        accessToken,
        ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
      };
      await this.saveSession(nextSession);
      return nextSession;
    })();

    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }
}

export function reconnectDelayMs(attempt: number): number {
  const cappedAttempt = Math.min(Math.max(attempt, 0), 6);
  const base = 1000 * 2 ** cappedAttempt;
  const jitter = Math.round(Math.random() * 500);
  return Math.min(30000, base + jitter);
}
