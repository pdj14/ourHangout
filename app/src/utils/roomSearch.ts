import type { Room, User } from '../types';

export function filterRooms(rooms: Room[], users: Record<string, User>, query: string): Room[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return rooms;

  return rooms.filter((room) => {
    const memberNames = room.memberIds
      .map((id) => `${users[id]?.name || ''} ${users[id]?.alias || ''}`)
      .join(' ');
    return `${room.title} ${room.preview} ${memberNames}`.toLocaleLowerCase().includes(normalized);
  });
}
