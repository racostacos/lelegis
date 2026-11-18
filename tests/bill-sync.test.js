import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billInfoUrl,
  isStale
} from '../src/lib/bill-sync.js';

test('builds official bill info URL', () => {
  assert.equal(
    billInfoUrl('26RS', 'HB844'),
    'https://legis.la.gov/legis/BillInfo.aspx?s=26RS&b=HB844'
  );
});

test('treats missing timestamps as stale', () => {
  assert.equal(isStale(null), true);
});

test('does not refresh a recent active-session bill', () => {
  const now = Date.parse('2026-11-18T18:00:00Z');
  assert.equal(isStale('2026-11-18 17:45:00', 30, now), false);
});

test('refreshes an old active-session bill', () => {
  const now = Date.parse('2026-11-18T18:00:00Z');
  assert.equal(isStale('2026-11-18 17:00:00', 30, now), true);
});
