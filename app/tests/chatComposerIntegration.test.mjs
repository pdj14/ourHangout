import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('regular and Guardian chat use the shared composer', async () => {
  const [room, guardian] = await Promise.all([
    read('../src/screens/RoomScreen.tsx'),
    read('../src/screens/OnDeviceAiScreen.tsx'),
  ]);
  assert.match(room, /<ChatComposer/);
  assert.match(guardian, /<ChatComposer/);
  assert.match(room, /supportedMedia=\{\['image', 'video', 'audio'\]\}/);
  assert.match(guardian, /supportedMedia=\{supportedMedia\}/);
});

test('Guardian chat keeps provider and model details out of the conversation surface', async () => {
  const guardian = await read('../src/screens/OnDeviceAiScreen.tsx');
  assert.match(guardian, /지금 나누는 이야기/);
  assert.doesNotMatch(guardian, /displayedOpenRouterModelName|modelStateTitle|modelStateDetail/);
  assert.match(guardian, /\{user \? '나' : guardianProfile\.name\}/);
});

test('OpenRouter content mapping covers image, video and audio', async () => {
  const source = await read('../src/services/guardianMultimodal.ts');
  assert.match(source, /type: 'image_url'/);
  assert.match(source, /type: 'video_url'/);
  assert.match(source, /type: 'input_audio'/);
});
