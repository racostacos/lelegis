import shp from 'shpjs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runD1Json, runD1SqlFile, sqlString } from '../src/lib/d1-cli.js';

const CHUNK_SIZE = 30000;

const SOURCES = [
  {
    chamber: 'HOUSE',
    expected: 105,
    url: 'https://redist.legis.la.gov/2020_Files/Shapefiles/HB14_House_221ES.zip',
    name: 'Louisiana House Act 4 (HB14), 2022 1st Extraordinary Session',
    effective: 'Current Louisiana House districts'
  },
  {
    chamber: 'SENATE',
    expected: 39,
    url: 'https://redist.legis.la.gov/2026_Files/Act955Senate/Shapefile/Act_955_Shapefile.zip',
    name: 'Louisiana Senate Act 955 (SB25), 2026 Regular Session',
    effective: 'Current Louisiana Senate districts, including 2026 changes to Districts 33, 34, and 35'
  }
];

function districtNumber(properties = {}) {
  const preferred = [
    'DISTRICT','District','district','DISTRICTNO','DISTRICT_N','DIST_NO',
    'DISTRICTNU','DISTRICT_NU','DIST','NAME','Name','name'
  ];
  for (const key of preferred) {
    if (properties[key] == null) continue;
    const m = String(properties[key]).match(/\d{1,3}/);
    if (m) return Number(m[0]);
  }
  for (const [key,value] of Object.entries(properties)) {
    if (!/dist/i.test(key) || value == null) continue;
    const m = String(value).match(/\d{1,3}/);
    if (m) return Number(m[0]);
  }
  return null;
}

function walkCoords(coords, fn) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    fn(coords[0], coords[1]);
    return;
  }
  for (const child of coords) walkCoords(child, fn);
}

function bounds(geometry) {
  let minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
  walkCoords(geometry.coordinates,(lon,lat)=>{
    minLon=Math.min(minLon,lon);
    minLat=Math.min(minLat,lat);
    maxLon=Math.max(maxLon,lon);
    maxLat=Math.max(maxLat,lat);
  });
  return {minLon,minLat,maxLon,maxLat};
}

function mergeFeatures(features) {
  const byDistrict = new Map();
  for (const feature of features) {
    if (!feature?.geometry) continue;
    const district = districtNumber(feature.properties);
    if (!district) throw new Error(`Could not identify district number: ${JSON.stringify(feature.properties)}`);

    const existing = byDistrict.get(district) ?? [];
    if (feature.geometry.type === 'Polygon') existing.push(feature.geometry.coordinates);
    else if (feature.geometry.type === 'MultiPolygon') existing.push(...feature.geometry.coordinates);
    else continue;

    byDistrict.set(district, existing);
  }

  return [...byDistrict.entries()].map(([district,coordinates])=>({
    district,
    geometry:{type:'MultiPolygon',coordinates}
  }));
}

function downloadZipWithCurl(source) {
  const dir = mkdtempSync(join(tmpdir(), `lelegis-${source.chamber.toLowerCase()}-`));
  const file = join(dir, 'districts.zip');

  try {
    console.log(`Downloading ${source.chamber}: ${source.url}`);
    execFileSync('curl', [
      '-fL',
      '--retry','8',
      '--retry-delay','2',
      '--retry-all-errors',
      '--connect-timeout','30',
      '--max-time','300',
      '-A','LeLegis/1.0 (public civic data sync)',
      '-o',file,
      source.url
    ], { stdio:'inherit' });

    return readFileSync(file);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
}

async function downloadGeoJSON(source) {
  const buffer = downloadZipWithCurl(source);
  const parsed = await shp(buffer);
  const collections = Array.isArray(parsed) ? parsed : [parsed];
  const features = collections.flatMap(x => x?.features ?? []);
  if (!features.length) throw new Error(`No ${source.chamber} features parsed`);
  return mergeFeatures(features);
}

function compressedGeometry(geometry) {
  return gzipSync(Buffer.from(JSON.stringify(geometry), 'utf8'), { level:9 }).toString('base64');
}

function chunksOf(text,size=CHUNK_SIZE) {
  const chunks=[];
  for(let i=0;i<text.length;i+=size) chunks.push(text.slice(i,i+size));
  return chunks;
}

function chamberComplete(source) {
  const rows = runD1Json(
    `SELECT COUNT(*) AS district_count
       FROM district_geometries
      WHERE chamber=${sqlString(source.chamber)}`
  );
  return Number(rows?.[0]?.district_count ?? 0) === source.expected;
}

for (const source of SOURCES) {
  if (chamberComplete(source)) {
    console.log(`${source.chamber}: already has all ${source.expected} districts in D1, skipping.`);
    continue;
  }

  const rows = await downloadGeoJSON(source);
  if (rows.length !== source.expected) {
    throw new Error(`${source.chamber}: expected ${source.expected} districts, parsed ${rows.length}`);
  }

  console.log(`${source.chamber}: parsed ${rows.length} official districts`);

  runD1SqlFile(
    `DELETE FROM district_geometry_chunks WHERE chamber=${sqlString(source.chamber)};
     DELETE FROM district_geometries WHERE chamber=${sqlString(source.chamber)};`,
    `lelegis-${source.chamber.toLowerCase()}-clear-`
  );

  for (const row of rows) {
    const b = bounds(row.geometry);
    const gz = compressedGeometry(row.geometry);
    const chunks = chunksOf(gz);

    runD1SqlFile(`
      INSERT INTO district_geometries
      (chamber,district_number,geometry_json,geometry_gzip_b64,min_lon,min_lat,max_lon,max_lat,source_name,source_url,effective_label,synced_at)
      VALUES(
        ${sqlString(source.chamber)},
        ${row.district},
        '{}',
        NULL,
        ${b.minLon},${b.minLat},${b.maxLon},${b.maxLat},
        ${sqlString(source.name)},
        ${sqlString(source.url)},
        ${sqlString(source.effective)},
        CURRENT_TIMESTAMP
      );
    `, `lelegis-${source.chamber.toLowerCase()}-${row.district}-meta-`);

    for (let i=0;i<chunks.length;i++) {
      runD1SqlFile(`
        INSERT INTO district_geometry_chunks(chamber,district_number,chunk_index,chunk_text)
        VALUES(
          ${sqlString(source.chamber)},
          ${row.district},
          ${i},
          ${sqlString(chunks[i])}
        );
      `, `lelegis-${source.chamber.toLowerCase()}-${row.district}-${i}-`);
    }

    console.log(`${source.chamber} District ${row.district}: ${chunks.length} chunks`);
  }
}

console.log('Official Louisiana district geometry sync complete.');
