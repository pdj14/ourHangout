import { isSessionInvalidError } from '../services/backend';
import type { BackendUserLocation, FamilyLocation, Room, User } from '../types';

export function createLocalId(prefix = 'local'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeErrorMessage(error: unknown): string {
  if (isSessionInvalidError(error)) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
  if (error instanceof Error) {
    const code = String((error as { code?: string }).code || '').trim();
    const message = String(error.message || '').trim();
    if (code === 'DEVELOPER_ERROR' || message.includes('DEVELOPER_ERROR')) {
      return 'Google 로그인 설정이 패키지명(com.ourhangout)에 맞게 등록되지 않았습니다. OAuth Android client의 package name과 SHA-1을 확인해 주세요.';
    }
    if (code === 'NETWORK_TIMEOUT') {
      return '서버 응답이 지연되고 있습니다. 네트워크 상태를 확인해 주세요.';
    }
    if ((error as { status?: number }).status === 429) {
      return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    if ((error as { status?: number }).status === 401) {
      return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
    }
    if (message) return message;
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => {
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    return b.updatedAt - a.updatedAt || a.title.localeCompare(b.title);
  });
}

export function resolveRemoteUri(baseUrl: string, value?: string | null): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^(https?|file|content):\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${baseUrl}${trimmed}`;
  return trimmed;
}

export function normalizeRoomTitle(room: Room, users: Record<string, User>, currentUserId: string): Room {
  if (room.type !== 'direct') return room;
  const peer = room.memberIds.map((id) => users[id]).find((user) => user && user.id !== currentUserId);
  if (!peer) return room;
  const title = peer.alias || peer.name;
  return title && title !== room.title ? { ...room, title } : room;
}

export function mapFamilyLocations(value: BackendUserLocation[] | undefined): FamilyLocation[] {
  return (value || [])
    .map((item) => {
      const userId = String(item.userId || '').trim();
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      if (!userId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        userId,
        name: String(item.name || '').trim(),
        latitude,
        longitude,
        ...(Number.isFinite(Number(item.accuracyM)) ? { accuracyM: Number(item.accuracyM) } : {}),
        ...(item.capturedAt ? { capturedAt: String(item.capturedAt) } : {}),
        ...(item.source ? { source: String(item.source) } : {}),
        locationSharingEnabled: item.locationSharingEnabled !== false,
      };
    })
    .filter((item): item is FamilyLocation => !!item);
}

export function roomIdFromUrl(value?: string | null): string {
  const url = String(value || '').trim();
  if (!url) return '';
  const match = /^ourhangout(?:renewal)?:\/\/room\/([^/?#]+)/i.exec(url);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}
