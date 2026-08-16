import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isZeroPricedModel,
  normalizeModelModalities,
} from '../src/services/modelCapabilities.ts';

test('normalizes supported model modalities and removes duplicates', () => {
  assert.deepEqual(
    normalizeModelModalities(['Text', 'image', 'audio', 'video', 'image', 'unknown']),
    ['text', 'image', 'audio', 'video']
  );
});

test('recognizes only fully zero-priced model metadata as free', () => {
  assert.equal(isZeroPricedModel({ prompt: '0', completion: '0', request: '0' }), true);
  assert.equal(isZeroPricedModel({ prompt: '0', completion: '0.000001', request: '0' }), false);
  assert.equal(isZeroPricedModel({ prompt: '0', completion: '0', image: '0.001' }), false);
  assert.equal(isZeroPricedModel({ prompt: '0' }), false);
});
