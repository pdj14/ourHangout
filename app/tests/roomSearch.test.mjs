import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRooms } from '../src/utils/roomSearch.ts';

const users = {
  mom: { name: '김민지', alias: '우리 엄마' },
  friend: { name: 'Alex', alias: '산책 친구' },
};
const rooms = [
  { id: 'family', title: '가족 아지트', preview: '저녁에 만나요', memberIds: ['mom'] },
  { id: 'direct', title: 'Alex', preview: 'See you tomorrow', memberIds: ['friend', 'unknown'] },
];

test('finds rooms by the alias displayed in the conversation list', () => {
  assert.deepEqual(filterRooms(rooms, users, '우리 엄마').map(room => room.id), ['family']);
});

test('continues searching names, titles and message previews', () => {
  for (const query of ['김민지', '아지트', '저녁']) {
    assert.equal(filterRooms(rooms, users, query)[0]?.id, 'family');
  }
  assert.equal(filterRooms(rooms, users, '  TOMORROW  ')[0]?.id, 'direct');
});

test('returns no results for an unknown query and tolerates missing members', () => {
  assert.deepEqual(filterRooms(rooms, users, '없는 대화'), []);
  assert.equal(filterRooms(rooms, users, 'alex')[0]?.id, 'direct');
});

test('clearing a query restores the original ordered list without mutation', () => {
  assert.equal(filterRooms(rooms, users, '  '), rooms);
  filterRooms(rooms, users, '엄마');
  assert.deepEqual(rooms.map(room => room.id), ['family', 'direct']);
});
