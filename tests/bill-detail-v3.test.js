import test from 'node:test';
import assert from 'node:assert/strict';
import { parseActionHistory, parsePrimaryAuthor, deriveVoteEvents } from '../src/lib/bill-detail-parser.js';

test('parses Louisiana action table rows directly', () => {
  const html = `
  <table>
    <tr><th>Date</th><th>Chamber</th><th>Journal Page</th><th>Action</th></tr>
    <tr><td>06/18</td><td>H</td><td></td><td>Effective date: 07/01/2026.</td></tr>
    <tr><td>05/29</td><td>H</td><td><a>141</a></td><td>Read by title, roll called, yeas 101, nays 0, Senate amendments concurred in.</td></tr>
    <tr><td>05/26</td><td>S</td><td><a>67</a></td><td>Rules suspended. Senate floor amendments read and adopted. Read by title, passed by a vote of 38 yeas and 0 nays, and ordered returned to the House.</td></tr>
  </table>`;
  const actions = parseActionHistory(html, 2026);
  assert.equal(actions.length, 3);
  assert.equal(actions[0].action_date, '2026-06-18');
  assert.equal(actions[1].journal_page, '141');
  assert.equal(actions[2].chamber, 'SENATE');
});

test('parses linked primary author heading', () => {
  const html = `<div>HB1 by Representative <a href="#">Jack McFarland</a> |</div>`;
  assert.equal(parsePrimaryAuthor(html, 'HB1'), 'Jack McFarland');
});

test('derives totals from action history', () => {
  const actions = [
    { action_date:'2026-04-16', chamber:'HOUSE', official_text:'Read third time by title, roll called on final passage, yeas 104, nays 0. Finally passed.' },
    { action_date:'2026-05-26', chamber:'SENATE', official_text:'Read by title, passed by a vote of 38 yeas and 0 nays, and ordered returned to the House.' },
    { action_date:'2026-05-29', chamber:'HOUSE', official_text:'Read by title, roll called, yeas 101, nays 0, Senate amendments concurred in.' }
  ];
  const links = [
    { source_url:'x1', sequence_number:564, chamber:'HOUSE', committee_short_name:null, vote_date:null, motion:'FINAL PASSAGE' },
    { source_url:'x2', sequence_number:1381, chamber:'SENATE', committee_short_name:null, vote_date:null, motion:'FINAL PASSAGE' },
    { source_url:'x3', sequence_number:1765, chamber:'HOUSE', committee_short_name:null, vote_date:null, motion:'CONCUR IN SENATE AMENDMENTS' }
  ];
  const floor = deriveVoteEvents(actions, links).filter(x => x.event_type === 'FLOOR');
  assert.deepEqual(floor.map(x => x.yea_total), [104, 38, 101]);
});
