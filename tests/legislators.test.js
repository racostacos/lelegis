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

test('parses suffix before given name', () => {
  assert.deepEqual(parseListingName('Landry, Jr. Terry'), {
    displayName: 'Terry Landry Jr',
    firstName: 'Terry',
    lastName: 'Landry'
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
  const html = `<div><a href="/H_Reps/members.aspx?ID=55">Fontenot, Bryan</a><div>District 55</div><div>Republican</div><div>406 W 3rd Street Suite 107 Thibodaux, LA 70301-3014</div><div>(985) 447-0999</div><div>hse055@legis.la.gov</div></div>`;
  const seats = parseLegislatorListing(html, { chamber: 'HOUSE', baseUrl: HOUSE_URL });
  assert.equal(seats.length, 1);
  assert.equal(seats[0].official_id, 'H055');
  assert.equal(seats[0].display_name, 'Bryan Fontenot');
  assert.equal(seats[0].district_number, 55);
  assert.equal(seats[0].party, 'Republican');
  assert.equal(seats[0].vacant, false);
});

test('parses a Senate listing block', () => {
  const html = `<section><a href="/smembers.aspx?ID=13">Hodges, Valarie</a><p>District 13</p><p>Republican</p><p>35055 La. Hwy. 16, Suite 2A Denham Springs, LA 70706</p><p>(225) 791-2199</p><p>sen13@legis.la.gov</p></section>`;
  const seats = parseLegislatorListing(html, { chamber: 'SENATE', baseUrl: SENATE_URL });
  assert.equal(seats.length, 1);
  assert.equal(seats[0].official_id, 'S013');
  assert.equal(seats[0].display_name, 'Valarie Hodges');
  assert.equal(seats[0].vacant, false);
});

test('parses a vacant House seat', () => {
  const html = `<section><a href="/H_Reps/members.aspx?ID=77">Vacant - District 77</a><p>District 77</p><p>312 South Jefferson Street Covington, LA 70433</p><p>(985) 893-6262</p></section>`;
  const seats = parseLegislatorListing(html, { chamber: 'HOUSE', baseUrl: HOUSE_URL });
  assert.equal(seats.length, 1);
  assert.deepEqual(seats[0], {
    chamber: 'HOUSE',
    district_number: 77,
    vacant: true,
    profile_url: 'https://house.louisiana.gov/H_Reps/members.aspx?ID=77'
  });
});

test('parses a vacant Senate seat', () => {
  const html = `<section><a href="/smembers.aspx?ID=14">Vacant - District 14</a><p>District 14</p><p>700 N. 10th Street Baton Rouge, LA 70802</p><p>(225)256-7756</p></section>`;
  const seats = parseLegislatorListing(html, { chamber: 'SENATE', baseUrl: SENATE_URL });
  assert.equal(seats.length, 1);
  assert.equal(seats[0].district_number, 14);
  assert.equal(seats[0].vacant, true);
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
    is_active: 1,
    vacant: false
  };
}

function fakeVacancy(chamber, district) {
  return {
    chamber,
    district_number: district,
    vacant: true,
    profile_url: `https://example.test/${chamber}/${district}`
  };
}

test('validates all 144 seats while allowing vacancies', () => {
  const house = Array.from({ length: 105 }, (_, i) => fakeMember('HOUSE', i + 1));
  const senate = Array.from({ length: 39 }, (_, i) => fakeMember('SENATE', i + 1));
  house[76] = fakeVacancy('HOUSE', 77);
  house[91] = fakeVacancy('HOUSE', 92);
  senate[13] = fakeVacancy('SENATE', 14);

  assert.deepEqual(validateLegislators(house, senate), {
    houseSeats: 105,
    senateSeats: 39,
    totalSeats: 144,
    houseLegislators: 103,
    senateLegislators: 38,
    totalLegislators: 141,
    houseVacancies: 2,
    senateVacancies: 1,
    totalVacancies: 3
  });
});

test('rejects duplicate and missing districts', () => {
  const house = Array.from({ length: 105 }, (_, i) => fakeMember('HOUSE', i + 1));
  house[104] = fakeMember('HOUSE', 104);
  const senate = Array.from({ length: 39 }, (_, i) => fakeMember('SENATE', i + 1));
  assert.throws(() => validateLegislators(house, senate), /missing district 105|duplicate district 104/);
});

test('rejects seat count mismatches', () => {
  const house = Array.from({ length: 104 }, (_, i) => fakeMember('HOUSE', i + 1));
  const senate = Array.from({ length: 39 }, (_, i) => fakeMember('SENATE', i + 1));
  assert.throws(() => validateLegislators(house, senate), /expected 105 seats, found 104/);
});
