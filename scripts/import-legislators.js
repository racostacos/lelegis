import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseLegislatorListing,
  validateLegislators
} from '../src/lib/legislator-parser.js';

const HOUSE_URL = 'https://house.louisiana.gov/H_Reps/H_Reps_FullInfo';
const SENATE_URL = 'https://senate.la.gov/Senators_FullInfo';
const DRY_RUN = process.argv.includes('--dry-run');

const sqlString = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const sqlInt = (value) => Number.isInteger(value) ? String(value) : 'NULL';

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

function buildSql(seats) {
  const lines = [
    'PRAGMA foreign_keys = ON;',
    '-- Current-seat importer from official Louisiana Legislature listings.'
  ];

  for (const chamber of ['HOUSE', 'SENATE']) {
    lines.push(`UPDATE legislators SET is_active = 0 WHERE chamber = ${sqlString(chamber)};`);
  }

  for (const seat of seats) {
    if (seat.vacant) continue;
    const m = seat;

    lines.push(`UPDATE legislators SET
  official_id = ${sqlString(m.official_id)},
  source_member_id = ${sqlString(m.source_member_id)},
  first_name = ${sqlString(m.first_name)},
  last_name = ${sqlString(m.last_name)},
  display_name = ${sqlString(m.display_name)},
  party = ${sqlString(m.party)},
  email = ${sqlString(m.email)},
  phone = ${sqlString(m.phone)},
  office_address = ${sqlString(m.office_address)},
  photo_url = ${sqlString(m.photo_url)},
  profile_url = ${sqlString(m.profile_url)},
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE chamber = ${sqlString(m.chamber)} AND district_number = ${sqlInt(m.district_number)};`);

    lines.push(`INSERT INTO legislators (official_id, source_member_id, first_name, last_name, display_name, chamber, district_number, party, email, phone, office_address, photo_url, profile_url, is_active)
SELECT ${sqlString(m.official_id)}, ${sqlString(m.source_member_id)}, ${sqlString(m.first_name)}, ${sqlString(m.last_name)}, ${sqlString(m.display_name)}, ${sqlString(m.chamber)}, ${sqlInt(m.district_number)}, ${sqlString(m.party)}, ${sqlString(m.email)}, ${sqlString(m.phone)}, ${sqlString(m.office_address)}, ${sqlString(m.photo_url)}, ${sqlString(m.profile_url)}, 1
WHERE NOT EXISTS (
  SELECT 1 FROM legislators WHERE chamber = ${sqlString(m.chamber)} AND district_number = ${sqlInt(m.district_number)}
);`);
  }

  return `${lines.join('\n\n')}\n`;
}

function printDryRun(seats) {
  const rows = seats.map((s) => ({
    chamber: s.chamber,
    district: s.district_number,
    status: s.vacant ? 'VACANT' : 'FILLED',
    name: s.vacant ? '' : s.display_name,
    party: s.vacant ? '' : s.party,
    email: s.vacant ? '' : (s.email ?? '')
  }));
  console.table(rows);
}

function runWrangler(sqlPath) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'lelegis', '--remote', `--file=${sqlPath}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`wrangler d1 execute exited with status ${result.status}`);
}

async function main() {
  const [houseHtml, senateHtml] = await Promise.all([
    fetchHtml(HOUSE_URL),
    fetchHtml(SENATE_URL)
  ]);

  const houseSeats = parseLegislatorListing(houseHtml, { chamber: 'HOUSE', baseUrl: HOUSE_URL });
  const senateSeats = parseLegislatorListing(senateHtml, { chamber: 'SENATE', baseUrl: SENATE_URL });
  const validation = validateLegislators(houseSeats, senateSeats);
  const allSeats = [...houseSeats, ...senateSeats].sort(
    (a, b) => a.chamber.localeCompare(b.chamber) || a.district_number - b.district_number
  );

  console.log(`House seats discovered: ${validation.houseSeats}`);
  console.log(`Senate seats discovered: ${validation.senateSeats}`);
  console.log(`Total seats discovered: ${validation.totalSeats}`);
  console.log(`House legislators discovered: ${validation.houseLegislators}`);
  console.log(`Senate legislators discovered: ${validation.senateLegislators}`);
  console.log(`Total legislators discovered: ${validation.totalLegislators}`);
  console.log(`Vacant seats discovered: ${validation.totalVacancies}`);

  if (DRY_RUN) {
    printDryRun(allSeats);
    console.log('Dry run only. No database changes were made.');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'lelegis-legislators-'));
  const sqlPath = join(dir, 'legislators.sql');
  try {
    writeFileSync(sqlPath, buildSql(allSeats), 'utf8');
    runWrangler(sqlPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('Legislator sync complete.');
  console.log(`House active legislators: ${validation.houseLegislators}`);
  console.log(`Senate active legislators: ${validation.senateLegislators}`);
  console.log(`Total active legislators: ${validation.totalLegislators}`);
  console.log(`Vacant seats: ${validation.totalVacancies}`);
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
