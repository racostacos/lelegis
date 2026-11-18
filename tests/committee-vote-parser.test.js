import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommitteeVotePage, resolveCommitteeMember } from '../src/lib/committee-vote-parser.js';

const house = `
<h4>2026 Regular Session</h4>
<div>House Committee on Appropriations</div>
<div>April 13, 2026</div>
<h4>HB1 by MCFARLAND</h4>
<h4>Amendment: HCAHB1 4448 3574</h4>
<div>Motion made by: Zeringue, Jerome</div>
<div>Motion: Adopt</div>
<div>Motion date: 4/13/2026 9:31:30 AM</div>
<div>Vote: 18-0</div>
<div>McFarland, Jack Yea</div>
<div>Adams, Roy Daryl Yea</div>
<h4>HB1 by MCFARLAND</h4>
<div>Motion made by: McFarland, Jack</div>
<div>Motion (Final): With Amendments</div>
<div>Motion date: 4/13/2026 10:58:10 AM</div>
<div>Vote: 18-0</div>
<div>McFarland, Jack Yea</div>
`;

const senate = `
<h4>2026 Regular Session</h4>
<div>Senate Committee on Finance</div>
<h4>HB1 by MCFARLAND</h4>
<h4>Amendment: SCAHB1 4278 4238</h4>
<div>Motion made by: Womack, Glen</div>
<div>Motion: Adopt</div>
<div>Motion date: 5/21/2026 10:57:17 AM</div>
<div>Vote: Without Objection</div>
<h4>HB1 by MCFARLAND</h4>
<div>Motion made by: Pressly, Thomas A.</div>
<div>Motion (Final): Report with Amendments</div>
<div>Motion date: 5/21/2026 10:57:42 AM</div>
<div>Vote: Without Objection</div>
`;

test('parses multiple House committee motions and member votes', () => {
  const parsed = parseCommitteeVotePage(house);
  assert.equal(parsed.chamber, 'HOUSE');
  assert.equal(parsed.instrument, 'HB1');
  assert.equal(parsed.motions.length, 2);
  assert.equal(parsed.motions[0].vote_method, 'ROLL_CALL');
  assert.equal(parsed.motions[0].yea_total, 18);
  assert.equal(parsed.motions[0].nay_total, 0);
  assert.equal(parsed.motions[0].members.length, 2);
  assert.equal(parsed.motions[1].motion, 'FINAL: With Amendments');
});

test('preserves Senate without-objection motions without inventing members', () => {
  const parsed = parseCommitteeVotePage(senate);
  assert.equal(parsed.chamber, 'SENATE');
  assert.equal(parsed.motions.length, 2);
  assert.equal(parsed.motions[0].vote_method, 'WITHOUT_OBJECTION');
  assert.equal(parsed.motions[0].members.length, 0);
  assert.equal(parsed.motions[1].vote_method, 'WITHOUT_OBJECTION');
});

test('resolves Louisiana committee Last, First format', () => {
  const rows = [
    { id:14, first_name:'Jack', last_name:'McFarland', display_name:'Jack McFarland' }
  ];
  assert.equal(resolveCommitteeMember(rows, 'McFarland, Jack').match.id, 14);
});
