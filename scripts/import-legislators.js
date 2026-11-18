import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseLegislatorListing,
  validateLegislators
} from '../src/lib/legislator-parser.js';
import { sqlString } from '../src/lib/d1-cli.js';

const HOUSE_URL = 'https://house.louisiana.gov/H_Reps/H_Reps_FullInfo';
const SENATE_URL = 'https://senate.la.gov/Senators_FullInfo';
const DRY_RUN = process.argv.includes('--dry-run');

const sqlInt = value => Number.isInteger(value) ? String(value) : 'NULL';

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

function personOfficialId(m) {
  if (m.source_member_id) {
    return `${m.chamber === 'HOUSE' ? 'HM' : 'SM'}${String(m.source_member_id).padStart(5,'0')}`;
  }
  return `${m.chamber === 'HOUSE' ? 'H' : 'S'}-D${String(m.district_number).padStart(3,'0')}-${m.last_name.toUpperCase().replace(/[^A-Z0-9]/g,'')}`;
}

function buildSql(seats) {
  const lines = [
    'PRAGMA foreign_keys = ON;',
    '-- History-safe current roster import.',
    'UPDATE legislators SET is_active = 0;'
  ];

  for (const seat of seats) {
    if (seat.vacant) {
      lines.push(`
UPDATE legislator_memberships
SET is_current = 0,
    end_date = COALESCE(end_date, DATE('now')),
    updated_at = CURRENT_TIMESTAMP
WHERE is_current = 1
  AND chamber = ${sqlString(seat.chamber)}
  AND district_number = ${sqlInt(seat.district_number)}
  AND session_id IN (SELECT id FROM sessions WHERE end_date >= DATE('now'));`);
      continue;
    }

    const m = seat;
    const personId = personOfficialId(m);

    // Update existing person by stable Louisiana member ID.
    lines.push(`
UPDATE legislators SET
  first_name = ${sqlString(m.first_name)},
  last_name = ${sqlString(m.last_name)},
  display_name = ${sqlString(m.display_name)},
  chamber = ${sqlString(m.chamber)},
  district_number = ${sqlInt(m.district_number)},
  party = ${sqlString(m.party)},
  email = ${sqlString(m.email)},
  phone = ${sqlString(m.phone)},
  office_address = ${sqlString(m.office_address)},
  photo_url = ${sqlString(m.photo_url)},
  profile_url = ${sqlString(m.profile_url)},
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE source_member_id = ${sqlString(m.source_member_id)}
  AND chamber = ${sqlString(m.chamber)};`);

    // Insert only if this person has never existed.
    lines.push(`
INSERT INTO legislators (
  official_id, source_member_id, first_name, last_name, display_name,
  chamber, district_number, party, email, phone, office_address,
  photo_url, profile_url, is_active
)
SELECT
  ${sqlString(personId)}, ${sqlString(m.source_member_id)}, ${sqlString(m.first_name)},
  ${sqlString(m.last_name)}, ${sqlString(m.display_name)}, ${sqlString(m.chamber)},
  ${sqlInt(m.district_number)}, ${sqlString(m.party)}, ${sqlString(m.email)},
  ${sqlString(m.phone)}, ${sqlString(m.office_address)}, ${sqlString(m.photo_url)},
  ${sqlString(m.profile_url)}, 1
WHERE NOT EXISTS (
  SELECT 1 FROM legislators
  WHERE source_member_id = ${sqlString(m.source_member_id)}
    AND chamber = ${sqlString(m.chamber)}
);`);

    // Close a prior current occupant in every current/future session.
    lines.push(`
UPDATE legislator_memberships
SET is_current = 0,
    end_date = COALESCE(end_date, DATE('now')),
    updated_at = CURRENT_TIMESTAMP
WHERE session_id IN (SELECT id FROM sessions WHERE end_date >= DATE('now'))
  AND chamber = ${sqlString(m.chamber)}
  AND district_number = ${sqlInt(m.district_number)}
  AND is_current = 1
  AND legislator_id <> (
    SELECT id FROM legislators
    WHERE source_member_id = ${sqlString(m.source_member_id)}
      AND chamber = ${sqlString(m.chamber)}
    ORDER BY id DESC LIMIT 1
  );`);

    // Create/maintain membership for all current or upcoming known sessions.
    lines.push(`
INSERT INTO legislator_memberships (
  session_id, legislator_id, chamber, district_number,
  source_member_id, start_date, is_current
)
SELECT
  s.id,
  l.id,
  ${sqlString(m.chamber)},
  ${sqlInt(m.district_number)},
  ${sqlString(m.source_member_id)},
  CASE WHEN s.start_date > DATE('now') THEN s.start_date ELSE DATE('now') END,
  1
FROM sessions s
JOIN legislators l
  ON l.source_member_id = ${sqlString(m.source_member_id)}
 AND l.chamber = ${sqlString(m.chamber)}
WHERE s.end_date >= DATE('now')
  AND NOT EXISTS (
    SELECT 1
    FROM legislator_memberships lm
    WHERE lm.session_id = s.id
      AND lm.legislator_id = l.id
      AND lm.chamber = ${sqlString(m.chamber)}
      AND lm.district_number = ${sqlInt(m.district_number)}
      AND lm.is_current = 1
  );`);
  }

  return `${lines.join('\n')}\n`;
}

function runWrangler(sqlPath) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'lelegis', '--remote', `--file=${sqlPath}`],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`wrangler exited ${result.status}`);
}

async function main() {
  const [houseHtml, senateHtml] = await Promise.all([
    fetchHtml(HOUSE_URL),
    fetchHtml(SENATE_URL)
  ]);

  const houseSeats = parseLegislatorListing(houseHtml, { chamber:'HOUSE', baseUrl:HOUSE_URL });
  const senateSeats = parseLegislatorListing(senateHtml, { chamber:'SENATE', baseUrl:SENATE_URL });
  const validation = validateLegislators(houseSeats, senateSeats);
  const seats = [...houseSeats, ...senateSeats];

  console.log(`House legislators: ${validation.houseLegislators}`);
  console.log(`Senate legislators: ${validation.senateLegislators}`);
  console.log(`Vacancies: ${validation.totalVacancies}`);

  if (DRY_RUN) {
    console.table(seats.slice(0,20).map(s => ({
      chamber:s.chamber,
      district:s.district_number,
      member:s.vacant ? 'VACANT' : s.display_name,
      source_member_id:s.source_member_id ?? ''
    })));
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'lelegis-roster-'));
  const file = join(dir, 'roster.sql');
  try {
    writeFileSync(file, buildSql(seats), 'utf8');
    runWrangler(file);
  } finally {
    rmSync(dir, { recursive:true, force:true });
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
