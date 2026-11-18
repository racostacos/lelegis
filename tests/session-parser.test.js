import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSessionLinks, parseSessionPage, activeOn } from '../src/lib/session-parser.js';

test('discovers official session link', () => {
  const rows = discoverSessionLinks(
    '<a href="/legis/SessionInfo/SessionInfo_27RS.aspx">2027 Regular Legislative Session Information</a>'
  );
  assert.equal(rows[0].session_code, '27RS');
});

test('parses session dates', () => {
  const session = parseSessionPage(
    '<h1>2027 Regular Legislative Session</h1> To convened on Monday, April 12, 2027 - Final Adjournment no later than 6:00 pm on Thursday, June 10, 2027',
    '27RS'
  );
  assert.equal(session.start_date, '2027-04-12');
  assert.equal(session.end_date, '2027-06-10');
  assert.equal(session.session_type, 'REGULAR');
});

test('active date check', () => {
  assert.equal(activeOn({start_date:'2027-04-12',end_date:'2027-06-10'}, '2027-05-01'), true);
});
