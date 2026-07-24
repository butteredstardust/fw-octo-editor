const test = require('node:test');
const assert = require('node:assert/strict');
const { toNumber, toInteger, sqlStr, requireChangedRows, batchSetWeaponXp } = require('../services/saveService');

test('integer validation rejects fractions, unsafe values, and out-of-range values', () => {
  assert.equal(toInteger('42','amount',{min:0,max:100}),42);
  for(const value of [1.5,NaN,Infinity,101,-1,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>toInteger(value,'amount',{min:0,max:100}));
});

// A non-numeric value (e.g. a string like "abc" sent for a weapon XP field)
// used to throw a plain Error with no .status, so routes fell back to a 500
// instead of a 400 -- toNumber() is the shared root cause since toInteger()
// (and every caller that validates through it: weapon XP, character/quest
// IDs, etc.) delegates its number coercion to it.
test('number/integer/string validation failures are 400s, not bare 500s, with a value-specific message', () => {
  assert.throws(() => toNumber('not-a-number', 'xp'), err => err.status === 400 && /xp/.test(err.message) && /not-a-number/.test(err.message));
  assert.throws(() => toInteger('not-a-number', 'xp', { min: 0 }), err => err.status === 400);
  assert.throws(() => sqlStr(42, 'name'), err => err.status === 400 && /number/.test(err.message));
  assert.throws(() => sqlStr('bad\0byte', 'name'), err => err.status === 400);
  assert.throws(() => sqlStr('bad\nbyte', 'name'), err => err.status === 400);
});

// batchSetWeaponXp validates every item (via toInteger/sqlStr) before it ever
// touches the database, so a bad entry can be tested without a real save/key.
// A single bad entry used to abort the whole batch (up to 250 items) with a
// bare "Invalid xp" and no indication of which entry was the problem.
test('a bad entry in a weapon-xp batch names its position and scope, not just "Invalid xp"', async () => {
  await assert.rejects(
    batchSetWeaponXp('fake-key', [
      { scope: 'Scope.Weapon.PST01', xp: 100 },
      { scope: 'Scope.Weapon.PST02', xp: 'not-a-number' },
      { scope: 'Scope.Weapon.PST03', xp: 200 }
    ]),
    err => err.status === 400 && /item 2 of 3/.test(err.message) && /PST02/.test(err.message)
  );
});

test('SQL strings escape quotes and reject shell-breaking controls', () => {
  assert.equal(sqlStr("O'Brien",'name'),"O''Brien");
  assert.throws(()=>sqlStr('line\nbreak','name'));
  assert.throws(()=>sqlStr('nul\0byte','name'));
});

test('changed-row checks fail closed on zero or excessive changes', () => {
  assert.equal(requireChangedRows('1',1,'test'),1);
  assert.throws(()=>requireChangedRows('0',1,'test'));
  assert.throws(()=>requireChangedRows('2',1,'test'));
});
