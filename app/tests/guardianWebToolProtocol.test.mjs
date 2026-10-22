import assert from 'node:assert/strict';
import test from 'node:test';

import {
  containsGuardianModelControlToken,
  containsGuardianWebToolCall,
  GUARDIAN_WEB_TOOL_RESPONSE_FALLBACK,
  parseGuardianWebToolCall,
  sanitizeGuardianVisibleContent,
} from '../src/services/guardianWebToolProtocol.ts';

test('parses standard tagged JSON tool calls', () => {
  assert.deepEqual(
    parseGuardianWebToolCall('<tool_call>{"name":"web_search","arguments":{"query":"안양 날씨"}}</tool_call>'),
    { name: 'web_search', arguments: { query: '안양 날씨' } }
  );
});

test('parses bare JSON and stringified arguments', () => {
  assert.deepEqual(
    parseGuardianWebToolCall('{"name":"open_url","arguments":"{\\"url\\":\\"https://example.com/news\\"}"}'),
    { name: 'open_url', arguments: { url: 'https://example.com/news' } }
  );
});

test('parses dots function call XML returned by routed models', () => {
  const value = `현재 날씨를 확인하겠습니다.
<dots_function_call>
<invoke name="web_search">
<parameter name="query">안양 날씨</parameter>
</invoke>
</dots_function_call>`;
  assert.deepEqual(parseGuardianWebToolCall(value), {
    name: 'web_search',
    arguments: { query: '안양 날씨' },
  });
});

test('decodes safe entities in invoke parameters', () => {
  const value = '<function_call><invoke name="open_url"><parameter name="url">https://example.com/?a=1&amp;b=2</parameter></invoke></function_call>';
  assert.deepEqual(parseGuardianWebToolCall(value), {
    name: 'open_url',
    arguments: { url: 'https://example.com/?a=1&b=2' },
  });
});

test('rejects malformed or unsafe tool calls', () => {
  assert.equal(parseGuardianWebToolCall('<invoke name="web_search"><parameter name="url">x</parameter></invoke>'), null);
  assert.equal(parseGuardianWebToolCall('{"name":"open_url","arguments":{"url":"file:///secret"}}'), null);
  assert.equal(parseGuardianWebToolCall('<invoke name="delete_data"></invoke>'), null);
});

test('detects and hides tool protocol text after a natural-language preamble', () => {
  const exposed = '검색하겠습니다.\n<dots_function_call><invoke name="web_search">';
  assert.equal(containsGuardianWebToolCall(exposed), true);
  assert.equal(sanitizeGuardianVisibleContent(exposed), GUARDIAN_WEB_TOOL_RESPONSE_FALLBACK);
  assert.equal(sanitizeGuardianVisibleContent('오늘은 맑고 최고 기온은 28도예요.'), '오늘은 맑고 최고 기온은 28도예요.');
});

test('hides model control-token floods and preserves surrounding natural text', () => {
  assert.equal(containsGuardianModelControlToken('<pad><pad><pad>'), true);
  assert.equal(sanitizeGuardianVisibleContent('<pad><pad><pad>'), GUARDIAN_WEB_TOOL_RESPONSE_FALLBACK);
  assert.equal(sanitizeGuardianVisibleContent('<s>안녕하세요.</s>'), '안녕하세요.');
});
