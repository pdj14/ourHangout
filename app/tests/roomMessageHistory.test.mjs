import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRoomMessagePage } from '../src/services/roomMessageHistory.ts';
import { mergeMessages } from '../src/services/mappers.ts';

test('history pages preserve and encode the backend cursor', async () => {
  const requests = [];
  const client = { async request(path) {
    requests.push(path);
    return requests.length === 1 ? { items: [{ id: 'new' }], nextCursor: 'older/+=' } : { items: [{ id: 'old' }] };
  } };
  const recent = await fetchRoomMessagePage(client, 'room');
  const older = await fetchRoomMessagePage(client, 'room', recent.nextCursor);
  assert.deepEqual(recent.items, [{ id: 'new' }]);
  assert.deepEqual(older.items, [{ id: 'old' }]);
  assert.equal(requests[1], '/v1/rooms/room/messages?limit=100&cursor=older%2F%2B%3D');
  assert.equal(older.nextCursor, undefined);
});

test('legacy arrays remain readable and malformed history responses report failure', async () => {
  assert.deepEqual(await fetchRoomMessagePage({ request: async () => [] }, 'room'), { items: [], nextCursor: undefined });
  await assert.rejects(fetchRoomMessagePage({ request: async () => ({}) }, 'room'), /메시지를 불러오지 못했어요/);
});

test('a repeated cursor cannot keep fetching the same page indefinitely', async () => {
  const page = await fetchRoomMessagePage({ request: async () => ({ items: [], nextCursor: 'same' }) }, 'room', 'same');
  assert.equal(page.nextCursor, undefined);
});

test('refreshing the latest page preserves older history, pending sends and live arrivals', () => {
  const message = (id, at, delivery = 'sent') => ({ id, at, delivery });
  const loaded = [message('old', 1), message('recent', 2), message('live', 3), message('local', 4, 'sending')];
  const merged = mergeMessages(loaded, [message('recent', 2, 'read')]);
  assert.deepEqual(merged.map(item => item.id), ['old', 'recent', 'live', 'local']);
  assert.equal(merged[1].delivery, 'read');
  assert.equal(merged[3].delivery, 'sending');
});

test('older pages prepend chronologically without duplicating overlapping messages', () => {
  const loaded = [{ id: 'b', at: 2 }, { id: 'c', at: 3 }];
  assert.deepEqual(mergeMessages(loaded, [{ id: 'a', at: 1 }, { id: 'b', at: 2 }]).map(item => item.id), ['a', 'b', 'c']);
  assert.deepEqual(loaded.map(item => item.id), ['b', 'c']);
});
