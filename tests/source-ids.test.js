import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMemberSourceId,
  extractBillSourceId,
  parsePrimaryAuthorSource,
  parseBillSearchSourceIds
} from '../src/lib/louisiana-source-ids.js';

test('extracts Louisiana member ID', () => {
  assert.equal(extractMemberSourceId('https://house.louisiana.gov/H_Reps/members?ID=13'), '13');
});

test('extracts canonical bill i', () => {
  assert.equal(extractBillSourceId('/Legis/BillInfo.aspx?i=249908'), '249908');
});

test('parses primary author from official profile link', () => {
  const html = `
    <div>Authors</div>
    <a href="https://house.louisiana.gov/H_Reps/members?ID=13">Jack McFarland</a> (primary)
  `;
  assert.deepEqual(parsePrimaryAuthorSource(html, 'HOUSE'), {
    source_member_id: '13',
    display_name: 'Jack McFarland',
    chamber: 'HOUSE',
    profile_url: 'https://house.louisiana.gov/H_Reps/members?ID=13',
    is_primary: true
  });
});

test('parses canonical bill IDs from bill search results', () => {
  const html = `
    <a href="/Legis/BillInfo.aspx?i=249908">HB1</a>
    <a href="/Legis/BillInfo.aspx?i=249909">HB2</a>
  `;
  assert.deepEqual(parseBillSearchSourceIds(html), [
    { instrument:'HB1', official_bill_id:'249908', source_url:'https://legis.la.gov/Legis/BillInfo.aspx?i=249908' },
    { instrument:'HB2', official_bill_id:'249909', source_url:'https://legis.la.gov/Legis/BillInfo.aspx?i=249909' }
  ]);
});
