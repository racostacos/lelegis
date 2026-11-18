import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommitteeVotePage, resolveCommitteeMember } from '../src/lib/committee-vote-parser.js';

const senateActualText = `
2026 Regular Session
Senate Committee on Finance
May 21, 2026
HB1 by MCFARLAND
APPROPRIATIONS: Provides for the ordinary operating expenses of state government for Fiscal Year 2026-2027
Amendment: SCAHB1 4278 4238
Motion made by: Womack, Glen
Motion: Adopt
Motion date: 5/21/2026 10:57:17 AM
Vote: Without Objection
|
HB1 by MCFARLAND
Motion made by: Pressly, Thomas A.
Motion (Final): Report with Amendments
Motion date: 5/21/2026 10:57:42 AM
Vote: Without Objection
|
Final action: Report with Amendments (Without Objection)
`;

const houseActualText = `
2026 Regular Session
House Committee on Appropriations
April 13, 2026
HB1 by MCFARLAND
APPROPRIATIONS: Provides for the ordinary operating expenses of state government for Fiscal Year 2026-2027
Amendment: HCAHB1 4448 3574
Motion made by: Zeringue, Jerome
Motion: Adopt
Motion date: 4/13/2026 9:31:30 AM
Vote: 18-0
|
McFarland, Jack Yea
Adams, Roy Daryl Yea
Amedée, Beryl Yea
Egan, Sr., Peter F. Yea
Zeringue, Jerome Yea
HB1 by MCFARLAND
Motion made by: McFarland, Jack
Motion: Special Order No. 1 for 4/16/26
Motion date: 4/13/2026 9:32:40 AM
Vote: 17-0
|
McFarland, Jack Yea
Adams, Roy Daryl Yea
Zeringue, Jerome Yea
HB1 by MCFARLAND
Motion made by: McFarland, Jack
Motion (Final): With Amendments
Motion date: 4/13/2026 10:58:10 AM
Vote: 18-0
|
McFarland, Jack Yea
Adams, Roy Daryl Yea
Zeringue, Jerome Yea
Final action: With Amendments (18-0)
`;

function fakeHtml(text) {
  return `<html><body><div>${text.replace(/\n/g,'</div><div>')}</div></body></html>`;
}

test('parses actual Senate Finance text stream', () => {
  const parsed = parseCommitteeVotePage(fakeHtml(senateActualText));
  assert.equal(parsed.chamber, 'SENATE');
  assert.equal(parsed.instrument, 'HB1');
  assert.equal(parsed.motions.length, 2);
  assert.equal(parsed.motions[0].vote_time, '10:57:17 AM');
  assert.equal(parsed.motions[0].vote_method, 'WITHOUT_OBJECTION');
  assert.equal(parsed.motions[0].members.length, 0);
  assert.equal(parsed.motions[1].motion, 'FINAL: Report with Amendments');
});

test('parses House roll-call motions from actual text stream', () => {
  const parsed = parseCommitteeVotePage(fakeHtml(houseActualText));
  assert.equal(parsed.chamber, 'HOUSE');
  assert.equal(parsed.instrument, 'HB1');
  assert.equal(parsed.motions.length, 3);
  assert.equal(parsed.motions[0].vote_method, 'ROLL_CALL');
  assert.equal(parsed.motions[0].yea_total, 18);
  assert.ok(parsed.motions[0].members.some(x => x.label.includes('McFarland')));
});

test('resolves suffix-form committee labels', () => {
  const rows = [{ id:1, first_name:'Peter', last_name:'Egan', display_name:'Peter F. Egan Sr' }];
  assert.equal(resolveCommitteeMember(rows, 'Egan, Sr., Peter F.').match.id, 1);
});
