import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoDate,
  parsePrimaryAuthor,
  parseActionHistory,
  parseVoteLinks,
  deriveVoteEvents
} from '../src/lib/bill-detail-parser.js';

test('fills session year into Louisiana action dates', () => {
  assert.equal(isoDate('06/18', 2026), '2026-06-18');
  assert.equal(isoDate('05/29', 2026), '2026-05-29');
});

test('parses primary author from expanded page', () => {
  const html = `<div>HB1 by Representative <a>Jack McFarland</a> |</div>
                <div>Authors</div><a>Jack McFarland (primary)</a>`;
  assert.equal(parsePrimaryAuthor(html, 'HB1'), 'Jack McFarland');
});

test('parses no-year expanded action rows', () => {
  const html = `
    <div>06/18</div><div>H</div>
    <div>Effective date: 07/01/2026.</div>
    <div>05/29</div><div>H</div><div>141</div>
    <div>Read by title, roll called, yeas 101, nays 0, Senate amendments concurred in.</div>
    <div>05/26</div><div>S</div><div>67</div>
    <div>Rules suspended. Read by title, passed by a vote of 38 yeas and 0 nays, and ordered returned to the House.</div>`;
  const actions = parseActionHistory(html, 2026);
  assert.equal(actions.length, 3);
  assert.equal(actions[0].action_date, '2026-06-18');
  assert.equal(actions[1].journal_page, '141');
  assert.equal(actions[2].chamber, 'SENATE');
});

test('parses expanded vote links with committee dates', () => {
  const html = `
    <a href="/ViewDocument.aspx?d=1">House Vote on HB 1 CONCUR IN SENATE AMENDMENTS (#1765)</a>
    <a href="/ViewDocument.aspx?d=2">Senate Vote on HB 1 FINAL PASSAGE (#1381)</a>
    <a href="/CommitteeVote.aspx?moi=3">Committee Vote H-APP 4/13/2026</a>`;
  const links = parseVoteLinks(html, 2026);
  assert.equal(links.length, 3);
  assert.equal(links[0].sequence_number, 1765);
  assert.equal(links[2].vote_date, '2026-04-13');
});

test('attaches vote totals to all three floor votes', () => {
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
  assert.deepEqual(floor.map(x => x.sequence_number), [564, 1381, 1765]);
});
