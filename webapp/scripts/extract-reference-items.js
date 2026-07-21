'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../services/configService');
const { loadKey } = require('../utils/keyLoader');
const { listInventoryItems } = require('../services/gvasService');

const source = process.argv[2] || path.resolve(__dirname, '..', '..', 'reference', 'YOUR_HASHCODE_HERE.dat');
const output = path.resolve(__dirname, '..', 'data', 'reference-items.snapshot.json');
const expectedName = '0002524f464349c086ad775367f0b95a.dat';

async function main() {
  if (!fs.existsSync(source)) throw new Error(`Reference save not found: ${source}`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-reference-items-'));
  try {
    fs.copyFileSync(source, path.join(tempDir, expectedName));
    const key = await loadKey();
    const items = await config.withSaveDir(tempDir, () => listInventoryItems(key));
    items.sort((a, b) => a.name.localeCompare(b.name));
    const snapshot = { schemaVersion: 1, extractedAt: new Date().toISOString(), sourceFile: path.basename(source), engine: 'uesave', count: items.length, items };
    fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Extracted ${items.length} authoritative inventory records from the reference save.`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
