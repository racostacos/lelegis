import test from 'node:test';
import assert from 'node:assert/strict';

test('documents required 2026 roll-call aliases', () => {
  const aliases = [
    ['HOUSE', 'Mr. Speaker'],
    ['HOUSE', 'Johnson, T.'],
    ['HOUSE', 'Stagni'],
    ['HOUSE', 'Wright'],
    ['SENATE', 'Mr. President'],
    ['SENATE', 'Selders']
  ];

  assert.equal(aliases.length, 6);
  assert.deepEqual(aliases[0], ['HOUSE', 'Mr. Speaker']);
  assert.deepEqual(aliases[5], ['SENATE', 'Selders']);
});
