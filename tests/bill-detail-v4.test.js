import test from 'node:test';
import assert from 'node:assert/strict';
import { parseActionHistory, parsePrimaryAuthor } from '../src/lib/bill-detail-parser.js';

test('uses Action column instead of later Video column', () => {
  const html = `
  <table>
    <tr><th>Date</th><th>Chamber</th><th>Journal Page</th><th>Action</th><th>Video</th></tr>
    <tr>
      <td>05/29</td>
      <td>H</td>
      <td>141</td>
      <td>Read by title, roll called, yeas 101, nays 0, Senate amendments concurred in.</td>
      <td><a>House 5/29 Video</a><a>House 5/29 Video part 2</a></td>
    </tr>
  </table>`;
  const actions = parseActionHistory(html, 2026);
  assert.equal(actions.length, 1);
  assert.equal(
    actions[0].official_text,
    'Read by title, roll called, yeas 101, nays 0, Senate amendments concurred in.'
  );
});

test('parses raw linked primary author marker', () => {
  const html = `<div>Authors</div><a href="/member">Jack McFarland</a> (primary)`;
  assert.equal(parsePrimaryAuthor(html, 'HB1'), 'Jack McFarland');
});

test('ignores video-only cells without a header map', () => {
  const html = `
  <table>
    <tr><td>04/13</td><td>H</td><td>53</td>
    <td>Reported with amendments (18-0).</td>
    <td><a>House 4/13 Video</a></td></tr>
  </table>`;
  const actions = parseActionHistory(html, 2026);
  assert.equal(actions[0].official_text, 'Reported with amendments (18-0).');
});
