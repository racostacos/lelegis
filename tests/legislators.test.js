import test from 'node:test';
import assert from 'node:assert/strict';
import {
  officialId,
  parseListingName,
  parseLegislatorListing,
  validateLegislators
} from '../src/lib/legislator-parser.js';

const HOUSE_URL = 'https://house.louisiana.gov/H_Reps/H_Reps_FullInfo';
const SENATE_URL = 'https://senate.la.gov/Senators_FullInfo';

test('official IDs are zero padded', () => {
  assert.equal(officialId('HOUSE', 55), 'H055');
  assert.equal(officialId('SENATE', 25), 'S025');
});

test('parses quoted nickname and Roman numeral suffix', () => {
  assert.deepEqual(parseListingName('Beaullieu, IV, Gerald "Beau"'), {
    displayName: 'Gerald "Beau" Beaullieu IV',
    firstName: 'Gerald',
    lastName: 'Beaullieu'
  });
});

test('parses suffix after surname', () => {
  assert.deepEqual(parseListingName('Bamburg, Jr., Dennis'), {
    displayName: 'Dennis Bamburg Jr',
    firstName: 'Dennis',
    lastName: 'Bamburg'
  });
});

test('parses suffix after given name', () => {
  assert.deepEqual(parseListingName('Cathey, Stewart Jr.'), {
    displayName: 'Stewart Cathey Jr',
    firstName: 'Stewart',
    lastName: 'Cathey'
  });
});

test('parses hyphenated surname', () => {
  assert.deepEqual(parseListingName('Jackson-Andrews, Katrina R.'), {
    displayName: 'Katrina R. Jackson-Andrews',
    firstName: 'Katrina',
    lastName: 'Jackson-Andrews'
  });
});

test('parses a House listing block', () => {
  const html = `<div><a href="/H_Reps/members?ID=55">Fontenot, Bryan</a><div>District 55</div><div>Republican</div><div>406 W 3rd Street Suite 107 Thibodaux, LA 70301-3014</div><div>(985) 447-0999</div><div>hse055@legis.la.gov</div></div>`;
  const members = parseLegislatorListing(html, { chamber: 'HOUSE', baseUrl: HOUSE_URL });
  assert.equal(members.length, 1);
  assert.equal(members[0].official_id, 'H055');
  assert.equal(members[0].display_name, 'Bryan Fontenot');
  assert.equal(members[0].district_number, 55);
  assert.equal(members[0].party, 'Republican');
  assert.equal(members[0].email, 'hse055@legis.la.gov');
  assert.equal(members[0].phone, '(985) 447-0999');
});

test('parses a Senate listing block', () => {
  const html = `<section><a href="/smembers?ID=13">Hodges, Valarie</a><p>District 13</p><p>Republican</p><p>35055 La. Hwy. 16, Suite 2A Denham Springs, LA 70706</p><p>(225) 791-2199</p><p>sen13@legis.la.gov</p></section>`;
  const members = parseLegislatorListing(html, { chamber: 'SENATE', baseUrl: SENATE_URL });
  assert.equal(members.length, 1);
  assert.equal(members[0].official_id, 'S013');
  assert.equal(members[0].display_name, 'Valarie Hodges');
  assert.equal(members[0].profile_url, 'https://senate.la.gov/smembers?ID=13');
});

function fakeMember(chamber, district) {
  return {
    official_id: officialId(chamber, district),
    first_name: `First${district}`,
    last_name: `Last${district}`,
    display_name: `First${district} Last${district}`,
    chamber,
    district_number: district,
    party: 'Republican',
    email: null,
    phone: null,
    office_address: null,
    photo_url: null,
    profile_url: `https://example.test/${chamber}/${district}`,
    is_active: 1
  };
}

test('validates complete House and Senate district coverage', () => {
  const house = Array.from({ length: 105 }, (_, i) => fakeMember('HOUSE', i + 1));
  const senate = Array.from({ length: 39 }, (_, i) => fakeMember('SENATE', i + 1));
  assert.deepEqual(validateLegislators(house, senate), { house: 105, senate: 39, total: 144 });
});

test('rejects duplicate and missing districts', () => {
  const house = Array.from({ length: 105 }, (_, i) => fakeMember('HOUSE', i + 1));
  house[104] = fakeMember('HOUSE', 104);
  const senate = Array.from({ length: 39 }, (_, i) => fakeMember('SENATE', i + 1));
  assert.throws(() => validateLegislators(house, senate), /missing district 105|duplicate district 104/);
});

test('rejects count mismatches', () => {
  const house = Array.from({ length: 104 }, (_, i) => fakeMember('HOUSE', i + 1));
  const senate = Array.from({ length: 39 }, (_, i) => fakeMember('SENATE', i + 1));
  assert.throws(() => validateLegislators(house, senate), /expected 105 members, found 104/);
});
