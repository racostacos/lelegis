import test from 'node:test';
import assert from 'node:assert/strict';
import {
  instrumentParts,
  normalizeStatus,
  parseBillInfoPage,
  validateBillIndex
} from '../src/lib/bill-index-parser.js';

test('parses instrument components', () => {
  assert.deepEqual(instrumentParts('hb844'), {
    instrument: 'HB844',
    instrumentType: 'HB',
    billNumber: 844,
    originChamber: 'HOUSE'
  });
  assert.deepEqual(instrumentParts('SCR68'), {
    instrument: 'SCR68',
    instrumentType: 'SCR',
    billNumber: 68,
    originChamber: 'SENATE'
  });
});

test('rejects malformed instruments', () => {
  assert.throws(() => instrumentParts('ABC12'), /Invalid legislative instrument/);
});

test('normalizes common final statuses', () => {
  assert.equal(normalizeStatus('Signed by the Governor - Act 677'), 'SIGNED');
  assert.equal(normalizeStatus('Sent to the Secretary of State'), 'ADOPTED');
  assert.equal(normalizeStatus('Vetoed by the Governor'), 'VETOED');
  assert.equal(normalizeStatus('Pending House Education'), 'PENDING');
  assert.equal(normalizeStatus('Subject to call - House final passage'), 'SUBJECT_TO_CALL');
});

test('parses a House bill page', () => {
  const html = `
    <html><body>
      <h2>2026 Regular Session</h2>
      <div>HB844 &nbsp;&nbsp;by Representative Bryan Fontenot |</div>
      <div><strong>MTR VEHICLE/VIOLATIONS:</strong> Defines the term "school zone" relative to the operation of a motor vehicle while using a wireless telecommunication device</div>
      <div>Current Status: <b>Signed by the Governor - Act 677</b></div>
      <div>Text Image: Expand Text</div>
    </body></html>`;

  const result = parseBillInfoPage(
    html,
    'HB844',
    'https://legis.la.gov/legis/BillInfo.aspx?s=26RS&b=HB844'
  );

  assert.equal(result.instrument, 'HB844');
  assert.equal(result.subject, 'MTR VEHICLE/VIOLATIONS');
  assert.match(result.official_description, /Defines the term/);
  assert.equal(result.official_status, 'Signed by the Governor - Act 677');
  assert.equal(result.normalized_status, 'SIGNED');
  assert.equal(result.originChamber, 'HOUSE');
});

test('parses a Senate resolution page', () => {
  const html = `
    <html><body>
      <div>SCR68 by Senator Michael "Big Mike" Fesi |</div>
      <div>TECHNOLOGY: Creates the Task Force on Blockchain and Digital Innovation.</div>
      <div>Current Status: Sent to the Secretary of State</div>
      <div>Text Image: Expand Text</div>
    </body></html>`;

  const result = parseBillInfoPage(
    html,
    'SCR68',
    'https://legis.la.gov/legis/BillInfo.aspx?s=26RS&b=SCR68'
  );

  assert.equal(result.instrumentType, 'SCR');
  assert.equal(result.billNumber, 68);
  assert.equal(result.originChamber, 'SENATE');
  assert.equal(result.subject, 'TECHNOLOGY');
  assert.equal(result.normalized_status, 'ADOPTED');
});

test('returns null for a nonmatching or missing bill page', () => {
  const html = `<html><body><h1>Bill Search</h1><p>No bill selected.</p></body></html>`;
  assert.equal(
    parseBillInfoPage(html, 'HB9999', 'https://example.test/HB9999'),
    null
  );
});

test('does not accept a different instrument page', () => {
  const html = `
    <div>HB10 by Representative Example |</div>
    <div>COURTS: Example description.</div>
    <div>Current Status: Pending House Judiciary</div>
    <div>Text Image: Expand Text</div>`;
  assert.equal(
    parseBillInfoPage(html, 'HB11', 'https://example.test/HB11'),
    null
  );
});

test('validates unique bill index records', () => {
  const records = [
    {
      instrument: 'HB1',
      instrumentType: 'HB',
      billNumber: 1,
      originChamber: 'HOUSE',
      subject: 'APPROPRIATIONS',
      official_description: 'Provides for the ordinary operating expenses of state government.',
      official_status: 'Signed by the Governor - Act 3',
      normalized_status: 'SIGNED',
      source_url: 'https://example.test/HB1'
    },
    {
      instrument: 'SR204',
      instrumentType: 'SR',
      billNumber: 204,
      originChamber: 'SENATE',
      subject: 'COMMENDATIONS',
      official_description: 'Commends an individual.',
      official_status: 'Sent to the Secretary of State',
      normalized_status: 'ADOPTED',
      source_url: 'https://example.test/SR204'
    }
  ];

  assert.deepEqual(validateBillIndex(records), {
    total: 2,
    byType: { HB: 1, SB: 0, HCR: 0, SCR: 0, HR: 0, SR: 1 }
  });
});

test('rejects duplicate instruments', () => {
  const record = {
    instrument: 'HB1',
    instrumentType: 'HB',
    billNumber: 1,
    originChamber: 'HOUSE',
    subject: 'APPROPRIATIONS',
    official_description: 'Description',
    official_status: 'Pending',
    normalized_status: 'PENDING',
    source_url: 'https://example.test/HB1'
  };
  assert.throws(() => validateBillIndex([record, { ...record }]), /duplicate instrument HB1/);
});


test('stops status before document sections', () => {
  const html = `
    <html><body>
      <div>HB1 by Representative Jack McFarland |</div>
      <div>APPROPRIATIONS: Provides for the ordinary operating expenses of state government</div>
      <div>Current Status: Signed by the Governor - Act 3</div>
      <div>Text</div><div>Amendments</div><div>Digests</div><div>Votes</div><div>Authors</div>
    </body></html>`;
  const result = parseBillInfoPage(html, 'HB1', 'https://example.test/HB1');
  assert.equal(result.official_status, 'Signed by the Governor - Act 3');
});
