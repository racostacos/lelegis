import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePrimaryAuthor } from '../src/lib/bill-detail-sync.js';

test('matches author using first and last name fields', () => {
  const rows = [
    { id: 1, display_name: 'McFarland, Jack', first_name: 'Jack', last_name: 'McFarland', is_active: 1 },
    { id: 2, display_name: 'John McFarland', first_name: 'John', last_name: 'McFarland', is_active: 1 }
  ];

  const result = choosePrimaryAuthor(rows, 'Jack McFarland');
  assert.equal(result.id, 1);
});

test('matches normal display-name format', () => {
  const rows = [
    { id: 3, display_name: 'Jack McFarland', first_name: 'Jack', last_name: 'McFarland', is_active: 1 }
  ];

  const result = choosePrimaryAuthor(rows, 'Jack McFarland');
  assert.equal(result.id, 3);
});

test('does not guess between equally scored people', () => {
  const rows = [
    { id: 4, display_name: 'Jack A. McFarland', first_name: 'Jack', last_name: 'McFarland', is_active: 1 },
    { id: 5, display_name: 'Jack B. McFarland', first_name: 'Jack', last_name: 'McFarland', is_active: 1 }
  ];

  assert.equal(choosePrimaryAuthor(rows, 'Jack McFarland'), null);
});
