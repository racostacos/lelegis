import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFloorRollCallText, resolveVoteLabel } from '../src/lib/floor-rollcall-parser.js';

const sample = `
2026 Regular Session
Sequence: 564 SPECIAL ORDERS
HB 1 BY MCFARLAND
FINAL PASSAGE
Date: 4/16/2026
Time: 10:50:44 AM
ROLL CALL
The roll was called with the following result:
YEAS
Adams
Carter, R.
McFarland
Total -- 3
NAYS
Total -- 0
ABSENT
Young
Total -- 1
`;

test('parses Louisiana floor roll call text', () => {
  const vote = parseFloorRollCallText(sample);
  assert.equal(vote.sequence_number, 564);
  assert.equal(vote.instrument, 'HB1');
  assert.equal(vote.motion, 'FINAL PASSAGE');
  assert.equal(vote.vote_date, '2026-04-16');
  assert.equal(vote.vote_time, '10:50:44 AM');
  assert.equal(vote.totals.YEA, 3);
  assert.equal(vote.totals.NAY, 0);
  assert.equal(vote.totals.ABSENT, 1);
  assert.equal(vote.members.length, 4);
});

test('resolves unique last name', () => {
  const rows = [{ id:1, first_name:'Jack', last_name:'McFarland' }];
  assert.equal(resolveVoteLabel(rows, 'McFarland').match.id, 1);
});

test('resolves same surname with first initial', () => {
  const rows = [
    { id:1, first_name:'Rick', last_name:'Carter' },
    { id:2, first_name:'Wilford', last_name:'Carter' }
  ];
  assert.equal(resolveVoteLabel(rows, 'Carter, R.').match.id, 1);
});

test('does not guess office title', () => {
  const rows = [{ id:1, first_name:'Phillip', last_name:'DeVillier' }];
  assert.equal(resolveVoteLabel(rows, 'Mr. Speaker').reason, 'office_title');
});
