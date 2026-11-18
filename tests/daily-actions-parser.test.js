import test from 'node:test';
import assert from 'node:assert/strict';
import { parseActionDocumentLinks, instrumentsFromDailyActionText } from '../src/lib/daily-actions-parser.js';

test('selects only todays house and senate PDFs', () => {
  const html = `
    <a href="/LegisDocs/27RS/lastlegs/h0412.pdf">12</a>
    <a href="/LegisDocs/27RS/lastlegs/s0412.pdf">12</a>
    <a href="/LegisDocs/27RS/lastlegs/h0411.pdf">11</a>`;
  const links = parseActionDocumentLinks(html, 'https://www.legis.la.gov/legisdocs/27RS/LastLegs.htm', new Date('2027-04-12T12:00:00'));
  assert.equal(links.length, 2);
  assert.deepEqual(links.map(x => x.chamber).sort(), ['HOUSE','SENATE']);
});

test('extracts unique changed instruments from daily actions text', () => {
  const text = 'HB1 McFarland ... HB 1 again ... SB25 Smith ... HCR7 Test';
  assert.deepEqual(instrumentsFromDailyActionText(text), ['HB1','HCR7','SB25']);
});
