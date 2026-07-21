const test = require('node:test');
const assert = require('node:assert/strict');
let normalizeSearch, searchScore, filterAndRank, cleanFallbackName, receiptSummary, validateInteger;

test.before(async () => {
  ({ normalizeSearch, searchScore, filterAndRank, cleanFallbackName, receiptSummary, validateInteger } = await import('../public/modules/ui-utils.mjs'));
});

test('search normalization ignores punctuation, accents, and case', () => {
  assert.equal(normalizeSearch('  M4A1—MAGAZÍNE_B  '), 'm4a1 magazine b');
});

test('token search supports word-order-independent matches', () => {
  assert.ok(searchScore('mag m4', ['M4A1 Magazine B', 'WPN_RFL12_MAG_556_02']) >= 0);
  assert.equal(searchScore('shotgun optic', ['M4A1 Magazine B']), -1);
});

test('friendly-name matches rank above technical-id matches', () => {
  const rows = [
    { name: 'Unrelated', id: 'm4-mag-internal' },
    { name: 'M4 Magazine', id: 'another-id' }
  ];
  const ranked = filterAndRank(rows, 'm4 mag', row => [row.name, row.id]);
  assert.equal(ranked[0].name, 'M4 Magazine');
});

test('fallback labels clean technical separators without losing identity', () => {
  assert.equal(cleanFallbackName('Inventory.Item.Drone_Recovery'), 'Drone Recovery');
  assert.equal(cleanFallbackName('RFL12_Broken'), 'RFL12 (Destroyed)');
});

test('receipt summary exposes verification metadata without secret material', () => {
  const summary = receiptSummary({ operationId: 'op-1', backupId: 'backup-1', afterIntegrity: { passed: true }, afterFk: { passed: true } });
  assert.match(summary, /Operation op-1/);
  assert.match(summary, /Integrity passed/);
  assert.doesNotMatch(summary, /dbKey|password|secret/i);
});

test('strict UI integer validation rejects truncation and enforces boundaries', () => {
  assert.equal(validateInteger('50', 'Prestige', { min: 0, max: 50 }), 50);
  assert.throws(() => validateInteger('5.5', 'Quantity', { min: 0 }), /whole number/);
  assert.throws(() => validateInteger('-1', 'Quantity', { min: 0 }), /between/);
  assert.throws(() => validateInteger('', 'Quantity', { min: 0 }), /required/);
});
