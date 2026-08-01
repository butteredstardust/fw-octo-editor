// codec.js
// Blob read/write against BinaryData + the uesave (Rust, UE5-aware) JSON
// codec, plus the mandatory byte-identical round-trip verification gate.
//
// The TempInventory blob (and other named GVAS blobs, e.g. PlayerLoadout,
// KnownItems, VaultInventory) are GVAS v3 / UE5 files stored (encrypted)
// inside the SQLite3MC .dat. After decryption via the DB key, we shell out to
// uesave.exe (to-json / from-json) to parse and re-serialize them losslessly.
//
// Verified: uesave round-trips our blob byte-identically (SHA256 matches), and
// quantity edits persist through to-json -> edit -> from-json.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runShell } = require('../../utils/validation');
const { getSavePaths } = require('./paths');

// Built CLI from tools/uesave-src. Override via env GVAS_UESAVE_BIN.
const DEFAULT_UESAVE = path.join(
  process.cwd(),
  '..',
  'tools',
  'uesave-src',
  'target',
  'release',
  'uesave.exe'
);
const UESAVE_BIN = process.env.GVAS_UESAVE_BIN
|| (fs.existsSync(DEFAULT_UESAVE) ? DEFAULT_UESAVE : null);

function runUesave(args, inputBuffer) {
  return new Promise((resolve, reject) => {
    if (!UESAVE_BIN || !fs.existsSync(UESAVE_BIN)) {
      return reject(new Error('uesave.exe not found. Build tools/uesave-src or set GVAS_UESAVE_BIN.'));
    }
    const child = spawn(UESAVE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => reject(new Error(`uesave spawn error: ${err.message}`)));
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`uesave exited ${code}: ${stderr || stdout}`));
      resolve(stdout);
    });
    if (inputBuffer) {
      child.stdin.write(inputBuffer);
    }
    child.stdin.end();
  });
}

async function readTempInventoryBlob(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT hex(Value) FROM BinaryData WHERE Name = 'TempInventory' LIMIT 1`
  ]);
  if (!results.length) throw new Error('TempInventory not found in BinaryData');
  return Buffer.from(results[0].trim(), 'hex');
}

async function writeTempInventoryBlob(key, blobBuffer) {
  const dbPath = getSavePaths()[0];
  const hex = blobBuffer.toString('hex');
  await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE BinaryData SET Value = X'${hex}' WHERE Name = 'TempInventory'`,
    `COMMIT`
  ]);
}

// Read the raw bytes of any named GVAS blob from BinaryData.
async function readNamedBlob(key, blobName) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT hex(Value) FROM BinaryData WHERE Name = '${blobName}' LIMIT 1`
  ]);
  if (!results.length) throw new Error(`${blobName} not found in BinaryData`);
  return Buffer.from(results[0].trim(), 'hex');
}

// Write one or more named GVAS blobs back to BinaryData in a single
// transaction, so a multi-blob edit (e.g. TempInventory + KnownItems)
// commits atomically or not at all.
async function writeNamedBlobs(key, blobsByName) {
  const dbPath = getSavePaths()[0];
  const statements = ['BEGIN IMMEDIATE'];
  for (const [name, buffer] of Object.entries(blobsByName)) {
    statements.push(`UPDATE BinaryData SET Value = X'${buffer.toString('hex')}' WHERE Name = '${name}'`);
  }
  statements.push('COMMIT');
  await runShell(dbPath, key, statements);
}

// Read + parse ANY named GVAS blob from BinaryData via uesave (e.g. PlayerLoadout).
// Returns the full uesave JSON object (root.properties...). Throws if not found.
async function readNamedBlobJson(key, blobName) {
  const blob = await readNamedBlob(key, blobName);
  return blobToJson(blob);
}

// Parse a decrypted GVAS blob buffer into the full uesave JSON object.
async function blobToJson(blobBuffer) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gvas-'));
  const inPath = path.join(tmp, 'in.blob');
  const outPath = path.join(tmp, 'out.json');
  fs.writeFileSync(inPath, blobBuffer);
  try {
    await runUesave(['to-json', '-i', inPath, '-o', outPath, '--no-warn'], null);
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// Re-serialize a uesave JSON object back into a GVAS blob buffer.
async function jsonToBlob(jsonObj) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gvas-'));
  const inPath = path.join(tmp, 'in.json');
  const outPath = path.join(tmp, 'out.blob');
  fs.writeFileSync(inPath, JSON.stringify(jsonObj));
  try {
    await runUesave(['from-json', '-i', inPath, '-o', outPath], null);
    return fs.readFileSync(outPath);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

async function requireByteIdenticalRoundTrip(blob) {
  if (!UESAVE_BIN || !fs.existsSync(UESAVE_BIN)) throw Object.assign(new Error('uesave.exe is required for inventory writes'), { status: 503 });
  const json = await blobToJson(blob);
  const roundTripped = await jsonToBlob(json);
  if (!roundTripped.equals(blob)) throw Object.assign(new Error('uesave byte-round-trip compatibility check failed; inventory writes are disabled'), { status: 503 });
  return json;
}

module.exports = {
  UESAVE_BIN,
  readTempInventoryBlob,
  writeTempInventoryBlob,
  readNamedBlob,
  writeNamedBlobs,
  readNamedBlobJson,
  blobToJson,
  jsonToBlob,
  requireByteIdenticalRoundTrip
};
