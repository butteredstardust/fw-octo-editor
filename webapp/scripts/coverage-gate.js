'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Regression-guard floor for line coverage on services/utils/routes. The
// codebase's measured baseline today is ~23% (saveService) up to 100%; this
// floor protects against *dropping* coverage and should be raised as the test
// suite grows. Override with COVERAGE_MIN (e.g. set to 70 once the suite matures).
const MIN_LINE_PCT = Number(process.env.COVERAGE_MIN || 20);
const TEST_GLOBS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['test/*.test.js', 'test/e2e/*.test.js'];

const tmpCovDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-cov-'));

const result = spawnSync(
  process.execPath,
  ['--test', '--experimental-test-coverage', ...TEST_GLOBS],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_V8_COVERAGE: tmpCovDir },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  }
);

const output = (result.stdout || '') + '\n' + (result.stderr || '');
const lines = output.split('\n');

const headerIdx = lines.findIndex((l) => /^\s*ℹ\s+file\s*\|\s*line %/.test(l));
if (headerIdx === -1) {
  console.error('Coverage table not found in test output.');
  process.exit(1);
}

const rows = [];
for (let i = headerIdx + 1; i < lines.length; i++) {
  const line = lines[i];
  if (/^\s*ℹ\s+all files/i.test(line)) break;
  const m = line.match(/^\s*ℹ\s+(.+?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/);
  if (!m) continue;
  rows.push({ file: m[1].trim(), line: Number(m[2]) });
}

const relevant = rows.filter((r) => !/^all files$/i.test(r.file));
let worst = null;
for (const r of relevant) {
  const isTarget = /(^|[\\/])(services|utils|routes)[\\/]/.test(r.file);
  if (!isTarget) continue;
  if (worst === null || r.line < worst.line) worst = r;
}

console.log(`Coverage gate: minimum ${MIN_LINE_PCT}% line coverage on services/utils/routes`);
for (const r of relevant) {
  const isTarget = /(^|[\\/])(services|utils|routes)[\\/]/.test(r.file);
  const flag = isTarget && r.line < MIN_LINE_PCT ? '  <-- BELOW FLOOR' : '';
  console.log(`  ${r.line.toFixed(2).padStart(6)}%  ${r.file}${flag}`);
}

try {
  fs.rmSync(tmpCovDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (worst && worst.line < MIN_LINE_PCT) {
  console.error(`\nCoverage gate FAILED: ${worst.file} at ${worst.line}% (floor ${MIN_LINE_PCT}%).`);
  process.exit(1);
}
console.log('\nCoverage gate passed.');
process.exit(0);
