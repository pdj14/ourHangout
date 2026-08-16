import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGuardianWebSearchQuery,
  shouldSearchGuardianWeb,
} from '../src/services/guardianWebSearchPolicy.ts';

test('recognizes explicit and current-information searches in Korean and English', () => {
  assert.equal(shouldSearchGuardianWeb('오늘 안양 날씨 알려줘'), true);
  assert.equal(shouldSearchGuardianWeb('Search the web for current weather in Anyang'), true);
  assert.equal(shouldSearchGuardianWeb('현재 OpenAI CEO가 누구야?'), true);
});

test('does not search for personal support conversations', () => {
  assert.equal(shouldSearchGuardianWeb('오늘 너무 속상해. 위로해 줘'), false);
});

test('removes instructions that reduce search result relevance', () => {
  assert.equal(
    buildGuardianWebSearchQuery('Search the web for current weather in Anyang and answer in Korean'),
    'current weather in Anyang'
  );
  assert.equal(buildGuardianWebSearchQuery('웹에서 OpenAI 현재 CEO 확인해 줘'), 'OpenAI 현재 CEO');
  assert.equal(buildGuardianWebSearchQuery('오늘 안양 날씨 알려줘'), '오늘 안양 날씨');
});
