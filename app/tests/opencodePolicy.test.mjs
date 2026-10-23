import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenCodeChatModel } from '../src/services/aiProviders/opencodePolicy.ts';
test('OpenCode only lists models using the chat-completions protocol', () => {
  for (const id of ['big-pickle','minimax-m2.5','deepseek-v4-pro','qwen3.8-max','glm-5.3-flash-free']) assert.equal(isOpenCodeChatModel(id), true, id);
  for (const id of ['gpt-6-sol','claude-opus-4-8','gemini-4-argon','jev-1.13','qwen3.8-flash','test']) assert.equal(isOpenCodeChatModel(id), false, id);
});
