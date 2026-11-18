import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function sqlString(value) {
  return value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

export function runD1Json(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'lelegis', '--remote', '--json', `--command=${sql}`],
    { encoding: 'utf8', shell: process.platform === 'win32' }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `wrangler exited ${result.status}`);

  const parsed = JSON.parse(result.stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  return entry?.results ?? entry?.result?.[0]?.results ?? [];
}

export function runD1SqlFile(sql, prefix = 'lelegis-sync-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const file = join(dir, 'sync.sql');

  try {
    writeFileSync(file, sql, 'utf8');

    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'lelegis', '--remote', `--file=${file}`],
      { stdio: 'inherit', shell: process.platform === 'win32' }
    );

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`wrangler exited ${result.status}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
