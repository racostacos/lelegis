import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoDate,
  normalizeAction,
  parsePrimaryAuthor,
  parseActionHistory,
  parseVoteLinks,
  deriveVoteEvents,
  parseBillDetails
} from '../src/lib/bill-detail-parser.js';

test('parses primary author from bill heading', () => {
  const html = `<div>HB844 by Representative Bryan Fontenot |</div>`;
  assert.equal(parsePrimaryAuthor(html, 'HB844'), 'Bryan Fontenot');
});

test('normalizes action dates and types', () => {
  assert.equal(isoDate('4/7/2026'), '2026-04-07');
  assert.equal(normalizeAction('Reported favorably (16-0).'), 'REPORTED_FAVORABLY');
  assert.equal(normalizeAction('Signed by the Governor. Becomes Act No. 677.'), 'SIGNED');
});

test('parses action-history table rows', () => {
  const html = `
    <table>
      <tr><th>Date</th><th>Chamber</th><th>Journal</th><th>Action</th></tr>
      <tr><td>03/30/2026</td><td>H</td><td>59</td><td>Reported favorably (16-0).</td></tr>
      <tr><td>04/07/2026</td><td>H</td><td>33</td><td>Read third time by title, amended, roll called on final passage, yeas 101, nays 0. Finally passed, title adopted, ordered to the Senate.</td></tr>
    </table>`;
  const actions = parseActionHistory(html);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].chamber, 'HOUSE');
  assert.equal(actions[0].journal_page, '59');
  assert.equal(actions[1].action_date, '2026-04-07');
});

test('parses official vote links', () => {
  const html = `
    <a href="/legis/ViewDocument.aspx?d=1459447">House Vote on HB 844 FINAL PASSAGE (#322)</a>
    <a href="/LEGIS/CommitteeVote.aspx?moi=975210">Committee Vote H-THPW 3/30/2026</a>`;
  const links = parseVoteLinks(html);
  assert.equal(links.length, 2);
  assert.equal(links[0].sequence_number, 322);
  assert.equal(links[0].chamber, 'HOUSE');
  assert.equal(links[1].committee_short_name, 'H-THPW');
  assert.equal(links[1].vote_date, '2026-03-30');
});

test('derives vote events and attaches source URLs', () => {
  const actions = [
    { action_date: '2026-03-30', chamber: 'HOUSE', official_text: 'Reported favorably (16-0).' },
    { action_date: '2026-04-07', chamber: 'HOUSE', official_text: 'Read third time by title, roll called on final passage, yeas 101, nays 0. Finally passed, title adopted, ordered to the Senate.' }
  ];
  const links = [
    { source_url: 'https://www.legis.la.gov/LEGIS/CommitteeVote.aspx?moi=975210', sequence_number: null, chamber: 'HOUSE', committee_short_name: 'H-THPW', vote_date: '2026-03-30', motion: null },
    { source_url: 'https://www.legis.la.gov/legis/ViewDocument.aspx?d=1459447', sequence_number: 322, chamber: 'HOUSE', committee_short_name: null, vote_date: null, motion: 'FINAL PASSAGE' }
  ];
  const events = deriveVoteEvents(actions, links);
  assert.equal(events.length, 2);
  assert.equal(events[0].yea_total, 16);
  assert.equal(events[0].committee_short_name, 'H-THPW');
  assert.equal(events[1].yea_total, 101);
  assert.equal(events[1].sequence_number, 322);
});

test('parses combined bill details', () => {
  const html = `
    <div>HB844 by Representative Bryan Fontenot |</div>
    <table>
      <tr><td>03/30/2026</td><td>H</td><td>59</td><td>Reported favorably (16-0).</td></tr>
    </table>
    <a href="/LEGIS/CommitteeVote.aspx?moi=975210">Committee Vote H-THPW 3/30/2026</a>`;
  const details = parseBillDetails(html, 'HB844');
  assert.equal(details.primary_author_text, 'Bryan Fontenot');
  assert.equal(details.actions.length, 1);
  assert.equal(details.vote_events.length, 1);
});
